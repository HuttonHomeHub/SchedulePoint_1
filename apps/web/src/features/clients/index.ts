/** Public surface of the clients feature. */
export {
  useClients,
  useClient,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  clientsQueryOptions,
  clientQueryOptions,
  clientKeys,
} from './api/use-clients';
export { ClientsTable } from './components/ClientsTable';
export { CreateClientButton } from './components/CreateClientButton';
export { ClientFormDialog } from './components/ClientFormDialog';
