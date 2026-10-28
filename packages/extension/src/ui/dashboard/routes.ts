/** Dashboard sections, addressed as dashboard.html#<id>. */
export const ROUTES = [
  { id: 'setup', title: 'Setup' },
  { id: 'profile', title: 'Profile' },
  { id: 'resumes', title: 'Resumes' },
  { id: 'saved-answers', title: 'Saved Answers' },
  { id: 'tracker', title: 'Tracker' },
  { id: 'settings', title: 'Settings' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

export function routeFromHash(hash: string): RouteId {
  const id = hash.replace(/^#/, '');
  return ROUTES.find((route) => route.id === id)?.id ?? 'profile';
}
