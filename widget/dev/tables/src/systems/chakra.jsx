/* The same everyday screen in six design systems, from their real components: a toolbar of buttons, a card,
 * a form, tabs, an alert and a small table. This one: chakra. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, MoreHorizontal, Mail, Info, Check } from 'lucide-react'

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'Active', plan: 'Team' },
  { name: 'Alan Turing', email: 'alan@example.com', status: 'Invited', plan: 'Pro' },
  { name: 'Grace Hopper', email: 'grace@example.com', status: 'Active', plan: 'Free' },
]


/* ---------- Chakra UI ---------- */
import * as C from '@chakra-ui/react'
function Chakra() {
  return <C.ChakraProvider><C.Stack spacing={8} p={8} w="900px">
    <C.HStack>
      <C.Button id="primary" colorScheme="teal" leftIcon={<Plus size={16} />}>New project</C.Button>
      <C.Button variant="outline" leftIcon={<Mail size={16} />}>Invite</C.Button>
      <C.IconButton aria-label="More" variant="ghost" icon={<MoreHorizontal size={18} />} />
      <C.Button colorScheme="red" leftIcon={<Trash2 size={16} />}>Delete</C.Button>
    </C.HStack>
    <C.Card w="380px">
      <C.CardHeader><C.Flex gap={3} align="center"><C.Avatar size="sm" name="Ada Lovelace" /><C.Box><C.Heading size="sm">Ada Lovelace</C.Heading><C.Text fontSize="sm" color="gray.500">ada@example.com</C.Text></C.Box><C.Badge ml="auto" colorScheme="purple">Admin</C.Badge></C.Flex></C.CardHeader>
      <C.CardBody pt={0}><C.Text fontSize="sm">Wrote the first program for the Analytical Engine.</C.Text></C.CardBody>
      <C.CardFooter pt={0}><C.Button w="full" leftIcon={<Check size={16} />}>Approve</C.Button></C.CardFooter>
    </C.Card>
    <C.Stack spacing={4} w="380px">
      <C.FormControl><C.FormLabel>Email</C.FormLabel><C.Input placeholder="you@example.com" /><C.FormHelperText>We’ll never share it.</C.FormHelperText></C.FormControl>
      <C.Checkbox>Accept terms and conditions</C.Checkbox>
      <C.FormControl display="flex" alignItems="center"><C.Switch id="air" mr={3} /><C.FormLabel htmlFor="air" mb={0}>Airplane mode</C.FormLabel></C.FormControl>
    </C.Stack>
    <C.Tabs w="380px"><C.TabList><C.Tab>Account</C.Tab><C.Tab>Password</C.Tab><C.Tab>Billing</C.Tab></C.TabList><C.TabPanels><C.TabPanel>Make changes to your account here.</C.TabPanel></C.TabPanels></C.Tabs>
    <C.Alert status="info" w="500px"><C.AlertIcon /><C.Box><C.AlertTitle>Heads up!</C.AlertTitle><C.AlertDescription>You can add components to your app using the cli.</C.AlertDescription></C.Box></C.Alert>
    <C.TableContainer borderWidth="1px" borderRadius="md"><C.Table size="sm"><C.Thead><C.Tr>{['Name', 'Status', 'Plan', ''].map(h => <C.Th key={h}>{h}</C.Th>)}</C.Tr></C.Thead>
      <C.Tbody>{PEOPLE.map(p => <C.Tr key={p.name}>
        <C.Td><C.HStack><C.Avatar size="xs" name={p.name} /><C.Text>{p.name}</C.Text></C.HStack></C.Td>
        <C.Td><C.Badge colorScheme={p.status === 'Active' ? 'green' : 'orange'}>{p.status}</C.Badge></C.Td>
        <C.Td>{p.plan}</C.Td>
        <C.Td textAlign="right"><C.IconButton size="sm" variant="ghost" aria-label="Open menu" icon={<MoreHorizontal size={16} />} /></C.Td>
      </C.Tr>)}</C.Tbody></C.Table></C.TableContainer>
  </C.Stack></C.ChakraProvider>
}

createRoot(document.getElementById('root')).render(<Chakra />)
window.systemReady = true
