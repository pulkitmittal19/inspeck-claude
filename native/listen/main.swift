// inspeck-listen: voice for Inspeck's notes, on macOS 26 and later.
//
// The browser in the Claude app may not use the microphone, so the plugin's
// server runs this instead: it listens with the Mac's own microphone, turns the
// speech into text with Apple's on-device SpeechAnalyzer (nothing leaves the
// Mac), and writes one JSON line per event to stdout:
//
//   {"type":"loading","what":"mic"|"model","progress":0.4}
//   {"type":"listening"}
//   {"type":"level","value":0.42}            how loud, 0–1, about 25 a second
//   {"type":"text","final":"…","partial":"…"} final words so far, and the words still settling
//   {"type":"done","text":"…"}               everything, once it has stopped
//   {"type":"error","code":"mic-denied"|"unsupported"|"failed","message":"…"}
//
// It stops on a line "stop" on stdin (or stdin closing), finishing the last
// words, or after --max seconds. SIGTERM ends it at once.
//
// Build (from the repo): npm run build:listen
import AVFoundation
import Foundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj), let line = String(data: data, encoding: .utf8) else { return }
  print(line)
}

func fail(_ code: String, _ message: String) -> Never {
  emit(["type": "error", "code": code, "message": message])
  exit(1)
}

let args = CommandLine.arguments
func option(_ name: String) -> String? {
  guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
  return args[i + 1]
}
let maxSeconds = Double(option("--max") ?? "120") ?? 120

// 1. The microphone. macOS asks once; the answer belongs to the app that started us (the Claude app, or Terminal).
emit(["type": "loading", "what": "mic"])
guard await AVCaptureDevice.requestAccess(for: .audio) else {
  fail("mic-denied", "Inspeck can't use the microphone. Allow it in System Settings › Privacy & Security › Microphone.")
}

// 2. The speech model, in the Mac's own language when Apple has one for it.
let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: option("--locale") ?? Locale.current.identifier)) ?? Locale(identifier: "en-US")
let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
do {
  if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
    emit(["type": "loading", "what": "model", "progress": 0])
    let watch = Task {
      while !Task.isCancelled {
        emit(["type": "loading", "what": "model", "progress": install.progress.fractionCompleted])
        try? await Task.sleep(for: .milliseconds(250))
      }
    }
    try await install.downloadAndInstall()
    watch.cancel()
  }
} catch {
  fail("failed", "Couldn't get the speech model: \(error.localizedDescription)")
}

let analyzer = SpeechAnalyzer(modules: [transcriber])
guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else { fail("unsupported", "No audio format for speech on this Mac.") }
let (inputs, feed) = AsyncStream<AnalyzerInput>.makeStream()

// 3. Microphone → the analyzer, with a level for the listening animation.
let engine = AVAudioEngine()
let node = engine.inputNode
let micFormat = node.outputFormat(forBus: 0)
guard micFormat.sampleRate > 0, let converter = AVAudioConverter(from: micFormat, to: format) else { fail("unsupported", "No microphone input.") }

final class Level: @unchecked Sendable {
  private var last = Date.distantPast
  private var smooth: Float = 0
  func push(_ buffer: AVAudioPCMBuffer) {
    guard let ch = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
    var sum: Float = 0
    for i in 0..<Int(buffer.frameLength) { sum += ch[i] * ch[i] }
    let rms = (sum / Float(buffer.frameLength)).squareRoot()
    /* A quiet room sits near -50 dB, speech around -30, a raised voice -15:
       on a log scale from -50 to -15, silence reads as nothing and talking fills the bars. */
    let db = 20 * log10(max(rms, 1e-5))
    let level = max(0, min(1, (db + 50) / 35))
    smooth = level > smooth ? level : smooth * 0.75 + level * 0.25
    if Date().timeIntervalSince(last) >= 0.04 {
      last = Date()
      print("{\"type\":\"level\",\"value\":\(String(format: "%.2f", smooth))}")
    }
  }
}
let level = Level()

node.installTap(onBus: 0, bufferSize: 1024, format: micFormat) { buffer, _ in
  level.push(buffer)
  let ratio = format.sampleRate / micFormat.sampleRate
  guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32) else { return }
  var given = false
  var err: NSError?
  converter.convert(to: out, error: &err) { _, status in
    if given { status.pointee = .noDataNow; return nil }
    given = true
    status.pointee = .haveData
    return buffer
  }
  if err == nil, out.frameLength > 0 { feed.yield(AnalyzerInput(buffer: out)) }
}

final class Words: @unchecked Sendable {
  var final = ""
  var partial = ""
  func send() { emit(["type": "text", "final": final, "partial": partial]) }
}
let words = Words()
let reader = Task {
  do {
    for try await r in transcriber.results {
      let text = String(r.text.characters)
      if r.isFinal { words.final += text; words.partial = "" } else { words.partial = text }
      words.send()
    }
  } catch {}
}

do {
  try engine.start()
  try await analyzer.start(inputSequence: inputs)
} catch {
  fail("failed", "Couldn't start listening: \(error.localizedDescription)")
}
emit(["type": "listening"])

// 4. Stop: on "stop", stdin closing, or the time limit. Then finish the last words.
let stopped = AsyncStream<Void> { done in
  Task.detached {
    do { for try await line in FileHandle.standardInput.bytes.lines where line.trimmingCharacters(in: .whitespaces) == "stop" { break } } catch {}
    done.yield(); done.finish()
  }
  Task.detached {
    try? await Task.sleep(for: .seconds(maxSeconds))
    done.yield(); done.finish()
  }
}
for await _ in stopped { break }

engine.stop()
node.removeTap(onBus: 0)
feed.finish()
try? await analyzer.finalizeAndFinishThroughEndOfInput()
_ = await reader.value
let text = (words.final + words.partial).trimmingCharacters(in: .whitespacesAndNewlines)
emit(["type": "done", "text": text])
exit(0)
