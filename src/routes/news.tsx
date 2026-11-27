import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout route for /news. It renders only the matched child route — the News
 * & Updates listing (`news.index`) or the full article (`news.$slug`). Without
 * this Outlet the nested article route has nowhere to mount, so a click on
 * "Read the full update" changed the URL but kept showing the listing.
 *
 * Both children render their own PublicShell, so this component must stay
 * minimal and must not wrap the Outlet in any page-level container.
 */
export const Route = createFileRoute('/news')({
  component: NewsLayout,
})

function NewsLayout() {
  return <Outlet />
}
