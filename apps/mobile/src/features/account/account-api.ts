/**
 * Chamadas de contas, cartões, permissões por conta e categorias.
 */

import {
  accountPermissionSchema,
  accountSchema,
  accountStatementRowSchema,
  adjustBalanceResponseSchema,
  categorySchema,
  type Account,
  type AccountPermission,
  type AccountStatementRow,
  type AdjustBalanceRequest,
  type AdjustBalanceResponse,
  type Category,
  type CreateAccountRequest,
  type CreateCategoryRequest,
  type SetAccountPermissionsRequest,
  type UpdateAccountRequest,
  type UpdateCategoryRequest,
} from '@ff/api-contracts';
import { z } from 'zod';
import { request } from '../../services/api-client';

const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

export async function listAccounts(
  accessToken: string,
  householdId: string,
  includeArchived = false,
): Promise<Account[]> {
  const body = await request(
    `/households/${householdId}/accounts?includeArchived=${String(includeArchived)}`,
    { accessToken },
  );
  return listOf(accountSchema).parse(body).items;
}

export async function getAccount(
  accessToken: string,
  householdId: string,
  accountId: string,
): Promise<Account> {
  return accountSchema.parse(
    await request(`/households/${householdId}/accounts/${accountId}`, { accessToken }),
  );
}

export async function createAccount(
  accessToken: string,
  householdId: string,
  input: CreateAccountRequest,
): Promise<Account> {
  return accountSchema.parse(
    await request(`/households/${householdId}/accounts`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function updateAccount(
  accessToken: string,
  householdId: string,
  accountId: string,
  input: UpdateAccountRequest,
): Promise<Account> {
  return accountSchema.parse(
    await request(`/households/${householdId}/accounts/${accountId}`, {
      method: 'PATCH',
      body: input,
      accessToken,
    }),
  );
}

export async function archiveAccount(
  accessToken: string,
  householdId: string,
  accountId: string,
  archived: boolean,
): Promise<Account> {
  return accountSchema.parse(
    await request(`/households/${householdId}/accounts/${accountId}/archive`, {
      method: 'POST',
      body: { archived },
      accessToken,
    }),
  );
}

export async function adjustBalance(
  accessToken: string,
  householdId: string,
  accountId: string,
  input: AdjustBalanceRequest,
): Promise<AdjustBalanceResponse> {
  return adjustBalanceResponseSchema.parse(
    await request(`/households/${householdId}/accounts/${accountId}/adjust-balance`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function accountStatement(
  accessToken: string,
  householdId: string,
  accountId: string,
  from: string,
  to: string,
): Promise<AccountStatementRow[]> {
  const body = await request(
    `/households/${householdId}/accounts/${accountId}/statement?from=${from}&to=${to}`,
    { accessToken },
  );
  return listOf(accountStatementRowSchema).parse(body).items;
}

export async function listAccountPermissions(
  accessToken: string,
  householdId: string,
  memberId: string,
): Promise<AccountPermission[]> {
  const body = await request(`/households/${householdId}/members/${memberId}/account-permissions`, {
    accessToken,
  });
  return listOf(accountPermissionSchema).parse(body).items;
}

export async function setAccountPermissions(
  accessToken: string,
  householdId: string,
  memberId: string,
  input: SetAccountPermissionsRequest,
): Promise<AccountPermission[]> {
  const body = await request(`/households/${householdId}/members/${memberId}/account-permissions`, {
    method: 'PUT',
    body: input,
    accessToken,
  });
  return listOf(accountPermissionSchema).parse(body).items;
}

export async function listCategories(
  accessToken: string,
  householdId: string,
  includeArchived = false,
): Promise<Category[]> {
  const body = await request(
    `/households/${householdId}/categories?includeArchived=${String(includeArchived)}`,
    { accessToken },
  );
  return listOf(categorySchema).parse(body).items;
}

export async function createCategory(
  accessToken: string,
  householdId: string,
  input: CreateCategoryRequest,
): Promise<Category> {
  return categorySchema.parse(
    await request(`/households/${householdId}/categories`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function updateCategory(
  accessToken: string,
  householdId: string,
  categoryId: string,
  input: UpdateCategoryRequest,
): Promise<Category> {
  return categorySchema.parse(
    await request(`/households/${householdId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: input,
      accessToken,
    }),
  );
}
