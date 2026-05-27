import { ControlSlider } from "./ControlSlider";

export type NumberControlConfig<TKey extends string> = {
  key: TKey;
  label: string;
  min: number;
  max: number;
  step: number;
  help?: string;
};

export function ConfiguredNumberControl<TKey extends string>({
  control,
  value,
  display,
  onChange,
}: {
  control: NumberControlConfig<TKey>;
  value: number;
  display: string;
  onChange: (key: TKey, value: number) => void;
}) {
  return (
    <ControlSlider
      label={control.label}
      value={value}
      min={control.min}
      max={control.max}
      step={control.step}
      display={display}
      help={control.help}
      onChange={(nextValue) => onChange(control.key, nextValue)}
    />
  );
}
