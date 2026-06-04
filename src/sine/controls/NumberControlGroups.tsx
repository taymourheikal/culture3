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
  collapsible = false,
  defaultOpen = true,
  showSaveActions = true,
  getValue,
  getDisplay,
  onSaveGroup,
  onChange,
}: {
  groups: Array<NumberControlGroup<TKey, TControl>>;
  savedGroup: string | null;
  savedPrefix: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  showSaveActions?: boolean;
  getValue: (key: TKey) => number;
  getDisplay: (control: TControl) => string;
  onSaveGroup?: (group: NumberControlGroup<TKey, TControl>, savedKey: string) => void;
  onChange: (group: NumberControlGroup<TKey, TControl>, key: TKey, value: number, savedKey: string) => void;
}) {
  return (
    <>
      {groups.map((group) => {
        const savedKey = `${savedPrefix}:${group.key}`;
        return (
          <ControlGroupSection
            key={group.key}
            title={group.title}
            saved={showSaveActions && savedGroup === savedKey}
            onSave={showSaveActions && onSaveGroup ? () => onSaveGroup(group, savedKey) : undefined}
            collapsible={collapsible}
            defaultOpen={defaultOpen}
            sectionId={savedKey}
          >
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
