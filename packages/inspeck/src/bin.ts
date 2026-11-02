#!/usr/bin/env node
import { main } from './cli'

/* Output cut short (`| head`, a closed terminal): nothing more to say, so stop quietly. */
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code === 'EPIPE') process.exit(process.exitCode ?? 0); throw err })

main(process.argv.slice(2)).then(code => { process.exitCode = code }, err => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
