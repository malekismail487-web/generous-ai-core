// Pre-auth tenant selection helpers.
// The country the user picks on /country lives in sessionStorage. Any code-based
// onboarding flow (school invite, activation code, parent code, ministry code)
// returns the tenant the code actually belongs to — that value ALWAYS wins.

export type SelectedTenant = {
  id: string | null;
  slug: string | null;
  name: string | null;
  code: string | null;
};

export function getSelectedTenant(): SelectedTenant {
  return {
    id: sessionStorage.getItem('selected_tenant_id'),
    slug: sessionStorage.getItem('selected_tenant_slug'),
    name: sessionStorage.getItem('selected_tenant_name'),
    code: sessionStorage.getItem('selected_tenant_code'),
  };
}

export function setSelectedTenant(t: {
  tenant_id?: string | null;
  tenant_slug?: string | null;
  tenant_name?: string | null;
  country_code?: string | null;
}) {
  if (t.tenant_id) sessionStorage.setItem('selected_tenant_id', t.tenant_id);
  if (t.tenant_slug) sessionStorage.setItem('selected_tenant_slug', t.tenant_slug);
  if (t.tenant_name) sessionStorage.setItem('selected_tenant_name', t.tenant_name);
  if (t.country_code) sessionStorage.setItem('selected_tenant_code', t.country_code);
}

/**
 * Reconcile the country picked pre-auth with the tenant returned by a
 * code-based RPC. Returns an override notice if they disagree.
 * The RPC's tenant ALWAYS wins.
 */
export function reconcileTenantFromCode(response: {
  tenant_id?: string | null;
  tenant_slug?: string | null;
  tenant_name?: string | null;
}): { overridden: boolean; from: string | null; to: string | null } {
  if (!response?.tenant_id) return { overridden: false, from: null, to: null };
  const prev = getSelectedTenant();
  const overridden = !!prev.id && prev.id !== response.tenant_id;
  const from = prev.name;
  setSelectedTenant(response);
  return { overridden, from, to: response.tenant_name ?? null };
}
