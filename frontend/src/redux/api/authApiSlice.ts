// src/redux/api/authApiSlice.ts
import { apiSlice } from "./apiSlice";

/**
 * Per section: an option number, or the account's own text. Missing means
 * the option the account's ID selects (see `defaults`).
 */
export type CopyrightWording = Record<string, number | string>;

// Mirrors backend CopyrightSettings; blank fields use the defaults
export interface CopyrightSettings {
  holder?: string;
  publisher?: string;
  contactEmail?: string;
  website?: string;
  customNotice?: string;
  wording?: CopyrightWording;
}

export interface CopyrightSection {
  key: string;
  label: string;
  description: string;
  options: string[]; // May contain {subject}, {year}, {holder}, {publisher}, {contact}
}

export interface CopyrightResponse {
  settings: CopyrightSettings;
  sections: CopyrightSection[];
  defaults: Record<string, number>;
  preview: string;
}

export const authApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
    }),
    register: builder.mutation({
      query: (userData) => ({
        url: "/auth/register",
        method: "POST",
        body: userData,
      }),
    }),
    logout: builder.mutation({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
    }),
    profile: builder.query({
      query: () => "/auth/profile",
    }),
    getCopyright: builder.query<CopyrightResponse, void>({
      query: () => "/auth/copyright",
      providesTags: [{ type: "User", id: "COPYRIGHT" }],
    }),
    updateCopyright: builder.mutation<CopyrightResponse, CopyrightSettings>({
      query: (body) => ({
        url: "/auth/copyright",
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "User", id: "COPYRIGHT" }],
    }),
    previewCopyright: builder.mutation<{ preview: string }, CopyrightSettings>({
      query: (body) => ({
        url: "/auth/copyright/preview",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useProfileQuery,
  useGetCopyrightQuery,
  useUpdateCopyrightMutation,
  usePreviewCopyrightMutation,
} = authApiSlice;
