import { z } from 'zod';
import { TOPICS, type Topic } from './context';

// After every committed write the store says what changed on this channel.
// Every extension page and the background share the origin, so an open
// Tracker refreshes when the side panel records an Application.

const CHANNEL = 'employ-me:data-changed';

const changeSchema = z.object({ topics: z.array(z.enum(TOPICS)) });

export function broadcastChanges(): (topics: readonly Topic[]) => void {
  const channel = new BroadcastChannel(CHANNEL);
  return (topics) => {
    channel.postMessage({ topics: [...topics] });
  };
}

/** Calls `onChange` whenever any of `topics` changes, in any extension page. Returns an unsubscribe. */
export function onDataChanged(topics: readonly Topic[], onChange: () => void): () => void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const change = changeSchema.safeParse(event.data);
    if (change.success && change.data.topics.some((topic) => topics.includes(topic))) onChange();
  };
  return () => {
    channel.close();
  };
}
