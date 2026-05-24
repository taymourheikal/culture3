import { Save } from "lucide-react";
import type { WaveSettings } from "../marketSignal";
import type { MarketDataSource, MarketPlaybackSettings, MarketRuntimeConfig } from "../marketRuntimeConfig";
import { isBtcSource, PLAYBACK_SETTING_BOUNDS, sourceLabel } from "../marketRuntimeConfig";
import { saveMarketSettingsGroup, saveMarketSourceDefault, savePlaybackSettingsGroup } from "../settingsStorage";
import { CONTROL_GROUPS, type ControlConfig } from "../sineControlGroups";
import { ControlSlider } from "./ControlSlider";

export function MarketControlGroups({
  settings,
  marketConfig,
  savedGroup,
  setSavedGroup,
  updateSetting,
  updatePlaybackSetting,
  updateMarketSource,
  replaceMarketConfig,
}: {
  settings: WaveSettings;
  marketConfig: MarketRuntimeConfig;
  savedGroup: string | null;
  setSavedGroup: (key: string | null) => void;
  updateSetting: (key: keyof WaveSettings, value: number) => void;
  updatePlaybackSetting: <K extends keyof MarketPlaybackSettings>(key: K, value: MarketPlaybackSettings[K]) => void;
  updateMarketSource: (source: MarketDataSource) => void;
  replaceMarketConfig: (config: MarketRuntimeConfig) => void;
}) {
  return (
    <div className="sine-parameters-stack">
      <section className="sine-control-group">
        <div className="sine-control-group-head">
          <div className="sine-control-group-title">Data Source</div>
          <button
            type="button"
            className="save-group-button"
            title="Save data source"
            onClick={() => {
              const saved = saveMarketSourceDefault(marketConfig);
              replaceMarketConfig(saved);
              setSavedGroup("market:source");
            }}
          >
            <Save size={16} />
          </button>
        </div>
        <label className="sine-select-field">
          <span>Source</span>
          <select value={marketConfig.source} onChange={(event) => updateMarketSource(event.target.value as MarketDataSource)}>
            <option value="generated">{sourceLabel("generated")}</option>
            <option value="btcusd_1m">{sourceLabel("btcusd_1m")}</option>
            <option value="btcusd_5m">{sourceLabel("btcusd_5m")}</option>
          </select>
        </label>
        {savedGroup === "market:source" ? <div className="saved-defaults">Saved defaults</div> : null}
      </section>

      {isBtcSource(marketConfig.source) ? (
        <section className="sine-control-group">
          <div className="sine-control-group-head">
            <div className="sine-control-group-title">BTC Playback</div>
            <button
              type="button"
              className="save-group-button"
              title="Save BTC playback"
              onClick={() => {
                savePlaybackSettingsGroup(marketConfig.playback, ["rocLengthBars", "startDateTime", "barsPerSecond"]);
                setSavedGroup("market:playback");
              }}
            >
              <Save size={16} />
            </button>
          </div>
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
          {savedGroup === "market:playback" ? <div className="saved-defaults">Saved defaults</div> : null}
        </section>
      ) : null}

      {!isBtcSource(marketConfig.source) ? (
        <section className="sine-control-group">
          <div className="sine-control-group-head">
            <div className="sine-control-group-title">Generated Playback</div>
            <button
              type="button"
              className="save-group-button"
              title="Save generated playback"
              onClick={() => {
                savePlaybackSettingsGroup(marketConfig.playback, ["generatedTicksPerSecond"]);
                setSavedGroup("market:generated-playback");
              }}
            >
              <Save size={16} />
            </button>
          </div>
          <ControlSlider
            label="Ticks per second"
            value={marketConfig.playback.generatedTicksPerSecond}
            min={PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.min}
            max={PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.max}
            step={PLAYBACK_SETTING_BOUNDS.generatedTicksPerSecond.step}
            display={`${marketConfig.playback.generatedTicksPerSecond} ticks/s`}
            onChange={(value) => updatePlaybackSetting("generatedTicksPerSecond", value)}
          />
          {savedGroup === "market:generated-playback" ? <div className="saved-defaults">Saved defaults</div> : null}
        </section>
      ) : null}

      {!isBtcSource(marketConfig.source) &&
        CONTROL_GROUPS.map((group) => (
          <section className="sine-control-group" key={group.key}>
            <div className="sine-control-group-head">
              <div className="sine-control-group-title">{group.title}</div>
              <button
                type="button"
                className="save-group-button"
                title={`Save ${group.title}`}
                onClick={() => {
                  saveMarketSettingsGroup(
                    settings,
                    group.controls.map((control) => control.key),
                  );
                  setSavedGroup(`market:${group.key}`);
                }}
              >
                <Save size={16} />
              </button>
            </div>
            <div className="sine-parameter-fields">
              {group.controls.map((control) => (
                <ConfiguredControl
                  key={control.key}
                  control={control}
                  settings={settings}
                  onChange={(key, value) => {
                    updateSetting(key, value);
                    if (savedGroup === `market:${group.key}`) setSavedGroup(null);
                  }}
                />
              ))}
            </div>
            {savedGroup === `market:${group.key}` ? <div className="saved-defaults">Saved defaults</div> : null}
          </section>
        ))}
    </div>
  );
}

function ConfiguredControl({
  control,
  settings,
  onChange,
}: {
  control: ControlConfig;
  settings: WaveSettings;
  onChange: (key: keyof WaveSettings, value: number) => void;
}) {
  return (
    <ControlSlider
      label={control.label}
      value={settings[control.key]}
      min={control.min}
      max={control.max}
      step={control.step}
      display={control.display(settings)}
      onChange={(value) => onChange(control.key, value)}
    />
  );
}
