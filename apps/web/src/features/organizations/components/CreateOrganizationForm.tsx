import { zodResolver } from '@hookform/resolvers/zod';
import type { OrganizationSummary } from '@repo/types';
import { useForm } from 'react-hook-form';

import { useCreateOrganization } from '../api/use-organizations';
import {
  createOrganizationSchema,
  type CreateOrganizationValues,
} from '../schemas/organization-schemas';

import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/** Create-organisation form. Calls `onCreated` with the new org once it exists. */
export function CreateOrganizationForm({
  onCreated,
}: {
  onCreated: (organization: OrganizationSummary) => void;
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrganizationValues>({ resolver: zodResolver(createOrganizationSchema) });
  const create = useCreateOrganization();

  const onSubmit = handleSubmit((values) => {
    create.mutate(values, { onSuccess: onCreated });
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormErrorSummary errors={errors} />
      {create.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {create.error.message}
        </p>
      ) : null}
      <TextField
        label="Organisation name"
        autoComplete="organization"
        error={errors.name?.message}
        {...register('name')}
      />
      <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create organisation'}
      </Button>
    </form>
  );
}
