import { clamp } from "./charts/canvas";
import type { SpawnerUniquenessDetailPacket } from "./marketWorkerProtocol";

export function SpawnerUniquenessModal({
  spawnerId,
  detail,
  loading,
  onClose,
}: {
  spawnerId: number;
  detail: SpawnerUniquenessDetailPacket | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="uniqueness-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="uniqueness-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Spawner ${spawnerId} uniqueness`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="uniqueness-modal-head">
          <div>
            <span className="sine-eyebrow">Spawner #{spawnerId}</span>
            <h3>Uniqueness</h3>
          </div>
          <button type="button" className="uniqueness-close" onClick={onClose} aria-label="Close uniqueness modal">
            x
          </button>
        </div>
        {loading || !detail ? (
          <div className="uniqueness-neighbors">
            <span>Loading</span>
            <strong>Requesting Worker detail...</strong>
          </div>
        ) : detail.skippedReason === "population_limit" ? (
          <div className="uniqueness-neighbors">
            <span>Paused</span>
            <strong>Uniqueness detail is paused above the configured population limit.</strong>
            <small>Raise the Uniqueness population limit or wait until the living population falls below it.</small>
          </div>
        ) : detail.score ? (
          <>
            <p className="uniqueness-explainer">
              Percentile shows how far this spawner sits from the living population compared with its peers. Raw distance is the direct
              Mahalanobis distance from the current population center.
            </p>
            <div className="uniqueness-score-grid">
              <UniquenessMetric label="Percentile" value={detail.score.score} />
              <UniquenessMetric label="Raw distance" value={detail.score.rawDistance} raw />
              <UniquenessMetric label="Population" value={detail.score.comparisonPopulationSize} raw />
              <UniquenessMetric
                label="Features"
                value={detail.score.activeFeatureCount}
                suffix={`/${detail.score.activeFeatureCount + detail.score.droppedFeatureCount}`}
                raw
              />
            </div>
            <div className="uniqueness-neighbors">
              <span>Comparison</span>
              <strong>
                tick {detail.score.comparisonTick} · {detail.score.version} · {detail.score.vectorVersion}
              </strong>
            </div>
            <div className="uniqueness-neighbors">
              <span>Nearest neighbors</span>
              <strong>{detail.score.nearestNeighborIds.length > 0 ? detail.score.nearestNeighborIds.map((id) => `#${id}`).join(", ") : "none"}</strong>
            </div>
            <FeatureDeviationList title="Most different features" features={detail.score.mostDissimilarFeatures} />
            <FeatureDeviationList title="Most typical features" features={detail.score.mostSimilarFeatures} />
          </>
        ) : (
          <div className="uniqueness-neighbors">
            <span>Unavailable</span>
            <strong>This spawner is no longer alive.</strong>
          </div>
        )}
      </section>
    </div>
  );
}

function UniquenessMetric({ label, value, suffix = "", raw = false }: { label: string; value: number; suffix?: string; raw?: boolean }) {
  return (
    <div className="uniqueness-metric">
      <span>{label}</span>
      <strong>
        {raw ? formatRaw(value) : formatScore(value)}
        {suffix}
      </strong>
    </div>
  );
}

function FeatureDeviationList({
  title,
  features,
}: {
  title: string;
  features: NonNullable<SpawnerUniquenessDetailPacket["score"]>["mostDissimilarFeatures"];
}) {
  return (
    <div className="uniqueness-feature-list">
      <span>{title}</span>
      {features.length > 0 ? (
        features.map((feature) => (
          <div key={feature.key} className="uniqueness-feature-row">
            <strong>{feature.label}</strong>
            <small>
              value {formatRaw(feature.value)} · median {formatRaw(feature.populationMedian)} · z {formatSigned(feature.zScore)}
            </small>
          </div>
        ))
      ) : (
        <strong>No meaningful deviations</strong>
      )}
    </div>
  );
}

function formatScore(value: number) {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function formatRaw(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(3);
}

function formatSigned(value: number) {
  const formatted = formatRaw(value);
  return value > 0 ? `+${formatted}` : formatted;
}
