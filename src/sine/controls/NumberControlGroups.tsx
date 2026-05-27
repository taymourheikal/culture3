import type { NumberControlConfig } from "./ConfiguredNumberControl";
import { ConfiguredNumberControl } from "./ConfiguredNumberControl";
import { ControlGroupSection } from "./ControlGroupSection";

export type NumberControlGroup<TKey extends string, TControl extends NumberControlConfig<TKey> = NumberControlConfig<TKey>> = {
  key: string;
  title: string;
  controls: TControl[];
};

export function NumberControlGroups<TKey extends string, TControl extends NumberControlConfig<TKey> = NumberControlConfig<TKey>>({
  groups,
  savedGroup,
  savedPrefix,
  getValue,
  getDisplay,
  onSaveGroup,
  onChange,
}: {
  groups: Array<NumberControlGroup<TKey, TControl>>;
  savedGroup: string | null;
  savedPrefix: string;
  getValue: (key: TKey) => number;
  getDisplay: (control: TControl) => string;
  onSaveGroup: (group: NumberControlGroup<TKey, TControl>, savedKey: string) => void;
  onChange: (group: NumberControlGroup<TKey, TControl>, key: TKey, value: number, savedKey: string) => void;
}) {
  return (
    <>
      {groups.map((group) => {
        const savedKey = `${savedPrefix}:${group.key}`;
        return (
          <ControlGroupSection key={group.key} title={group.title} saved={savedGroup === savedKey} onSave={() => onSaveGroup(group, savedKey)}>
            <div className="sine-parameter-fields">
              {group.controls.map((control) => (
                <ConfiguredNumberControl
                  key={control.key}
                  control={control}
                  value={getValue(control.key)}
                  display={getDisplay(control)}
                  onChange={(key, value) => onChange(group, key, value, savedKey)}
                />
              ))}
            </div>
          </ControlGroupSection>
        );
      })}
    </>
  );
}
