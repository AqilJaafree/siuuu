import { App } from '../components/App.js'
import { DEMO_CASES, loadFeed } from './lib/feed.js'

// Prerendered. These numbers still come out of the engine — `loadFeed` reads the
// cards `scripts/precompute-proofs.ts` computed by running the real verifier against
// the real corpus, and the corpus does not exist on the deploy target. Rendering this
// route dynamically would mean calling the engine per request, which is exactly how
// the homepage came to 500 on Netlify. Static also means a missing or unreadable
// demo-proofs.json fails the BUILD instead of the first visitor.
export default function Page() {
  const clips = loadFeed()
  return <App initialClips={clips} cases={DEMO_CASES} />
}
