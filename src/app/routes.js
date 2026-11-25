/* Navigation structure (UI_UX_GUIDELINES §4) and module build phases for placeholders. */
export const NAV = [
  { group: 'Overview', items: [
    { path: '/', label: 'Dashboard', icon: 'dashboard', phase: 10 },
    { path: '/calendar', label: 'Calendar', icon: 'calendar', phase: 9 },
  ] },
  { group: 'Sales', items: [
    { path: '/sales/new', label: 'New sale', icon: 'newSale', phase: 6 },
    { path: '/sales', label: 'Sales', icon: 'sales', phase: 6 },
    { path: '/collections', label: 'Collections', icon: 'collections', phase: 7 },
    { path: '/customers', label: 'Customers', icon: 'customers', phase: 5 },
  ] },
  { group: 'Stock', items: [
    { path: '/items', label: 'Items', icon: 'items', phase: 4 },
    { path: '/movements', label: 'Movements', icon: 'movements', phase: 4 },
    { path: '/stock-count', label: 'Stock count', icon: 'stockCount', phase: 4 },
    { path: '/restocks', label: 'Restocks', icon: 'restocks', phase: 8 },
    { path: '/suppliers', label: 'Suppliers', icon: 'suppliers', phase: 8 },
  ] },
  { group: 'Finance', items: [
    { path: '/expenses', label: 'Expenses', icon: 'expenses', phase: 8 },
    { path: '/reports', label: 'Reports', icon: 'reports', phase: 10 },
  ] },
  { group: 'System', items: [
    { path: '/opening-balances', label: 'Opening balances', icon: 'statement', phase: 11 },
    { path: '/activity', label: 'Activity log', icon: 'activity', phase: 11 },
    { path: '/backup', label: 'Backup', icon: 'backup', phase: 11 },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ] },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);

/** Most specific nav item for a path (for highlighting and page titles). */
export function activeNavItem(path) {
  return [...ALL_NAV_ITEMS].sort((a, b) => b.path.length - a.path.length)
    .find((i) => (i.path === '/' ? path === '/' : path === i.path || path.startsWith(i.path + '/'))) || null;
}
