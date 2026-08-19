"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { User, UserRole } from "@/types";

export interface UsersListResponse {
  items: User[];
  total: number;
}

export interface UseUsersQueryParams {
  skip: number;
  limit: number;
  role?: UserRole;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

export function useUsersQuery({ skip, limit, role, isActive }: UseUsersQueryParams) {
  const query = useQuery({
    queryKey: ["users", { skip, limit, role: role ?? null, isActive: isActive ?? null }],
    queryFn: async (): Promise<UsersListResponse> => {
      const { data } = await api.get<UsersListResponse>("/users", {
        params: {
          skip,
          limit,
          role: role ?? undefined,
          is_active: typeof isActive === "boolean" ? isActive : undefined,
        },
      });
      return data;
    },
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load accounts.") : null,
    refetch: query.refetch,
  };
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateUserPayload }): Promise<User> => {
      const { data } = await api.patch<User>(`/users/${id}`, body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
