import { useQuery } from "@tanstack/react-query";
import * as finance from "@/lib/admin/financeService";

const KEY = ["admin", "finance"] as const;

export function useAdminSubscriptions(filters: {
  search?: string;
  status?: string;
  planCode?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;
  return useQuery({
    queryKey: [...KEY, "subscriptions", filters],
    staleTime: 15_000,
    queryFn: () =>
      finance.listSubscriptions({
        search: filters.search,
        status: filters.status,
        planCode: filters.planCode,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}

export function useAdminInvoices(filters: {
  search?: string;
  status?: string;
  createdAfter?: string;
  createdBefore?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;
  return useQuery({
    queryKey: [...KEY, "invoices", filters],
    staleTime: 15_000,
    queryFn: () =>
      finance.listInvoices({
        search: filters.search,
        status: filters.status,
        createdAfter: filters.createdAfter,
        createdBefore: filters.createdBefore,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}

export function useAdminDunningList(filters: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;
  return useQuery({
    queryKey: [...KEY, "dunning", filters],
    staleTime: 15_000,
    queryFn: () =>
      finance.listDunningCases({
        search: filters.search,
        status: filters.status,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}
