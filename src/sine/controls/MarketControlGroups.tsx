import type { WaveSettings } from "../marketSignal";
import { roundForInput } from "../charts/format";
import type { MarketDataSource, MarketPlaybackSettings, MarketRuntimeConfig } from "../marketRuntimeConfig";
import { isBtcSource, PLAYBACK_SETTING_BOUNDS, sourceLabel } from "../marketRuntimeConfig";
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
  saveMarketSource?: (config: MarketRuntimeConfig) => MarketRuntimeConfig;
  savePlaybackSettings?: (playback: MarketPlaybackSettings, keys: Array<keyof MarketPlaybackSettings>) => MarketRuntimeConfig;
  saveMarketSettings?: (settings: WaveSettings, keys: Array<keyof WaveSettings>) => WaveSettings;
}) {
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
