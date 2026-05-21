import { runSuite } from "./sine-tests/helpers";
import { tests as genomeTests } from "./sine-tests/genome.test";
import { tests as genomeMutationTests } from "./sine-tests/genomeMutation.test";
import { tests as genomeRuntimeTests } from "./sine-tests/genomeRuntime.test";
import { tests as settingsTests } from "./sine-tests/settings.test";
import { tests as spawnerWorldTests } from "./sine-tests/spawnerWorld.test";
import { tests as timelineTests } from "./sine-tests/timeline.test";
import { tests as uniquenessTests } from "./sine-tests/uniqueness.test";

runSuite("timeline", timelineTests);
runSuite("spawner world", spawnerWorldTests);
runSuite("settings", settingsTests);
runSuite("genome", genomeTests);
runSuite("genome mutation", genomeMutationTests);
runSuite("genome runtime", genomeRuntimeTests);
runSuite("uniqueness", uniquenessTests);

console.log("Sine simulator contract tests passed.");
