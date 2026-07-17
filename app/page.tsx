import { App } from '../components/App.js'
import { DEMO_CASES, loadFeed } from './lib/feed.js'

// The corpus is read off disk per request. Never prerendered into a static blob —
// the whole point is that these numbers come out of the engine, not a snapshot.
export const dynamic = 'force-dynamic'

export default function Page() {
  const clips = loadFeed()
  return <App initialClips={clips} cases={DEMO_CASES} />
}
