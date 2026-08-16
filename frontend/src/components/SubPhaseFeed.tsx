import { UpdatesFeed } from "./UpdatesFeed";

export function SubPhaseFeed({ subPhaseId }: { subPhaseId: number }) {
  return <UpdatesFeed feedPath={`/sub-phases/${subPhaseId}/updates`} />;
}
