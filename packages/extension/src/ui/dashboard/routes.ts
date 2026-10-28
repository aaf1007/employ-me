/** Dashboard sections, addressed as dashboard.html#<id>. */
export const ROUTES = [
  { id: 'profile', title: 'Profile' },
  { id: 'saved-answers', title: 'Saved Answers' },
  { id: 'tracker', title: 'Tracker' },
  { id: 'settings', title: 'Settings' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

export function routeFromHash(hash: string): RouteId {
  const id = hash.replace(/^#/, '');
  return ROUTES.find((route) => route.id === id)?.id ?? 'profile';
}
