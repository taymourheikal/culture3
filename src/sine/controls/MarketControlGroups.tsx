import type { WaveSettings } from "../marketSignal";
import { roundForInput } from "../charts/format";
import type { MarketDataSource, MarketPlaybackEndMode, MarketPlaybackSettings, MarketRuntimeConfig } from "../marketRuntimeConfig";
import { isBtcSource, PLAYBACK_SETTING_BOUNDS, sourceLabel, sourceSupportsDatePlaybackEnd } from "../marketRuntimeConfig";
import { saveMarketSettingsGroup, saveMarketSourceDefault, savePlaybackSettingsGroup } from "../settingsStorage";
import { CONTROL_GROUPS, type ControlConfig } from "../sineControlGroups";
import { ControlGroupSection } from "./ControlGroupSection";
import { ControlSlider } from "./ControlSlider";
import { NumberControlGroups } from "./NumberControlGroups";

export function MarketControlGroups({
  settings,
  marketConfig,
  savedGroup,
  setSavedGroup,
  updateSetting,
  updatePlaybackSetting,
  updateMarketSource,
  replaceMarketConfig,
  showSaveActions = true,
  showPlaybackEndControls = true,
  saveMarketSource = saveMarketSourceDefault,
  savePlaybackSettings = savePlaybackSettingsGroup,
  saveMarketSettings = saveMarketSettingsGroup,
}: {
  settings: WaveSettings;
  marketConfig: MarketRuntimeConfig;
  savedGroup: string | null;
  setSavedGroup: (key: string | null) => void;
  updateSetting: (key: keyof WaveSettings, value: number) => void;
  updatePlaybackSetting: <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => void;
  updateMarketSource: (source: MarketDataSource) => void;
  replaceMarketConfig: (config: MarketRuntimeConfig) => void;
  showSaveActions?: boolean;
  showPlaybackEndControls?: boolean;
  saveMarketSource?: (config: MarketRuntimeConfig) => MarketRuntimeConfig;
  savePlaybackSettings?: (playback: MarketPlaybackSettings, keys: Array<keyof MarketPlaybackSettings>) => MarketRuntimeConfig;
  saveMarketSettings?: (settings: WaveSettings, keys: Array<keyof WaveSettings>) => WaveSettings;
}) {
  const supportsDateEnd = sourceSupportsDatePlaybackEnd(marketConfig.source);
  const playbackForEndSave = supportsDateEnd || marketConfig.playback.endMode !== "date"
    ? marketConfig.playback
    : { ...marketConfig.playback, endMode: "none" as const };

  return (
    <div className="sine-parameters-stack">
      <ControlGroupSection
        title="Data Source"
        saveTitle="Save data source"
        saved={showSaveActions && savedGroup === "market:source"}
        onSave={showSaveActions ? () => {
          const saved = saveMarketSource(marketConfig);
          replaceMarketConfig(saved);
          setSavedGroup("market:source");
        } : undefined}
      >
        <label className="sine-select-field">
          <span>Source</span>
          <select value={marketConfig.source} onChange={(event) => updateMarketSource(event.target.value as MarketDataSource)}>
            <option value="generated">{sourceLabel("generated")}</option>
            <option value="btcusd_1m">{sourceLabel("btcusd_1m")}</option>
            <option value="btcusd_5m">{sourceLabel("btcusd_5m")}</option>
          </select>
        </label>
      </ControlGroupSection>

      {isBtcSource(marketConfig.source) ? (
        <ControlGroupSection
          title="BTC Playback"
          saveTitle="Save BTC playback"
          saved={showSaveActions && savedGroup === "market:playback"}
          onSave={showSaveActions ? () => {
            replaceMarketConfig(savePlaybackSettings(marketConfig.playback, ["rocLengthBars", "startDateTime", "barsPerSecond"]));
            setSavedGroup("market:playback");
          } : undefined}
        >
          <ControlSlider
            label="ROC length"
            value={marketConfig.playback.rocLengthBars}
            min={1}
            max={500}
            step={1}
            display={`${marketConfig.playback.rocLengthBars} bars`}
            onChange={(value) => updatePlaybackSetting("rocLengthBars", value)}
          />
          <label className="sine-select-field">
            <span>Start date/time (UTC)</span>
            <input
              type="datetime-local"
              value={marketConfig.playback.startDateTime}
              onChange={(event) => updatePlaybackSetting("startDateTime", event.target.value)}
            />
          </label>
          <ControlSlider
            label="Bars per second"
            value={marketConfig.playback.barsPerSecond}
            min={1}
            max={240}
            step={1}
            display={`${marketConfig.playback.barsPerSecond} bars/s`}
            onChange={(value) => updatePlaybackSetting("barsPerSecond", value)}
          />
        </ControlGroupSection>
      ) : null}

      {!isBtcSource(marketConfig.source) ? (
        <ControlGroupSection
          title="Generated Playback"
          saveTitle="Save generated playback"
          saved={showSaveActions && savedGroup === "market:generated-playback"}
          onSave={showSaveActions ? () => {
            replaceMarketConfig(savePlaybackSettings(marketConfig.playback, ["generatedTicksPerSecond"]));
            setSavedGroup("market:generated-playback");
          } : undefined}
        >
          <ControlSlider
            label="Ticks per second"
            value={marketConfig.playback.generatedTicksPerSecond}
            min={PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.min}
            max={PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.max}
            step={PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.step}
            display={`${roundForInput(marketConfig.playback.generatedTicksPerSecond, PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.step)} ticks/s`}
            onChange={(value) => updatePlaybackSetting("generatedTicksPerSecond", value)}
          />
        </ControlGroupSection>
      ) : null}

      {showPlaybackEndControls ? (
        <PlaybackEndControls
          playback={marketConfig.playback}
          supportsDateEnd={supportsDateEnd}
          saved={showSaveActions && savedGroup === "market:playback-end"}
          onSave={showSaveActions ? () => {
            replaceMarketConfig(savePlaybackSettings(playbackForEndSave, ["endMode", "endAfterTicks", "endDateTime"]));
            setSavedGroup("market:playback-end");
          } : undefined}
          updatePlaybackSetting={updatePlaybackSetting}
        />
      ) : null}

      {!isBtcSource(marketConfig.source) &&
        <NumberControlGroups<keyof WaveSettings, ControlConfig>
          groups={CONTROL_GROUPS}
          savedGroup={savedGroup}
          savedPrefix="market"
          showSaveActions={showSaveActions}
          getValue={(key) => settings[key]}
          getDisplay={(control) => control.display(settings)}
          onSaveGroup={(group, savedKey) => {
              saveMarketSettings(
                settings,
                group.controls.map((control) => control.key),
              );
              setSavedGroup(savedKey);
          }}
          onChange={(_group, key, value, savedKey) => {
            updateSetting(key, value);
            if (savedGroup === savedKey) setSavedGroup(null);
          }}
        />}
    </div>
  );
}

function PlaybackEndControls({
  playback,
  supportsDateEnd,
  saved,
  onSave,
  updatePlaybackSetting,
}: {
  playback: MarketPlaybackSettings;
  supportsDateEnd: boolean;
  saved: boolean;
  onSave?: () => void;
  updatePlaybackSetting: <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => void;
}) {
  const visibleEndMode = supportsDateEnd || playback.endMode !== "date" ? playback.endMode : "none";
  return (
    <ControlGroupSection title="Playback End" saveTitle="Save playback end" saved={saved} onSave={onSave}>
      <label className="sine-select-field">
        <span>End mode</span>
        <select value={visibleEndMode} onChange={(event) => updatePlaybackSetting("endMode", event.target.value as MarketPlaybackEndMode)}>
          <option value="none">No deterministic end</option>
          <option value="ticks">After ticks</option>
          {supportsDateEnd ? <option value="date">At date</option> : null}
        </select>
      </label>
      {visibleEndMode === "ticks" ? (
        <label className="sine-select-field">
          <span>End after ticks</span>
          <input
            type="number"
            min={PLAYBACK_SETTING_BOUNDS.endAfterTicks.min}
            max={PLAYBACK_SETTING_BOUNDS.endAfterTicks.max}
            step={PLAYBACK_SETTING_BOUNDS.endAfterTicks.step}
            value={roundForInput(playback.endAfterTicks, PLAYBACK_SETTING_BOUNDS.endAfterTicks.step)}
            onChange={(event) => updatePlaybackSetting("endAfterTicks", Number(event.target.value))}
          />
        </label>
      ) : null}
      {visibleEndMode === "date" && supportsDateEnd ? (
        <label className="sine-select-field">
          <span>End date/time (UTC)</span>
          <input
            type="datetime-local"
            value={playback.endDateTime}
            onChange={(event) => updatePlaybackSetting("endDateTime", event.target.value)}
          />
        </label>
      ) : null}
    </ControlGroupSection>
  );
}
