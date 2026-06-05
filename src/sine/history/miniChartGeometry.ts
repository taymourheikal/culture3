export type MiniChartGeometry = {
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  min: number;
  max: number;
  xMin: number;
  xMax: number;
  xValues: number[];
  centerSinglePoint: boolean;
  range: number;
};

export type MiniChartGeometryOptions<T> = {
  width: number;
  height: number;
  plotTop?: number;
  plotBottom?: number;
  xValue?: (row: T, index: number) => number;
  centerSinglePoint?: boolean;
};

export function miniChartGeometry<T extends { tick: number }>(
  rows: T[],
  values: number[],
  {
    width,
    height,
    plotTop = 10,
    plotBottom = height - 10,
    xValue,
    centerSinglePoint = false,
  }: MiniChartGeometryOptions<T>,
): MiniChartGeometry {
  const finiteValues = values.filter(Number.isFinite);
  const min = Math.min(...finiteValues, 0);
  const max = Math.max(...finiteValues, 1);
  const xValues = rows.map((row, index) => {
    const value = xValue?.(row, index) ?? row.tick;
    return Number.isFinite(value) ? value : index;
  });
  const domain = xDomainForValues(xValues);
  return {
    width,
    height,
    plotTop,
    plotBottom,
    min,
    max,
    xMin: domain.min,
    xMax: domain.max,
    xValues,
    centerSinglePoint,
    range: Math.max(1e-9, max - min),
  };
}

export function miniChartX(index: number, geometry: MiniChartGeometry) {
  if (geometry.centerSinglePoint && geometry.xValues.length <= 1) return geometry.width / 2;
  const xValue = geometry.xValues[index] ?? 0;
  return ((xValue - geometry.xMin) / Math.max(1e-9, geometry.xMax - geometry.xMin)) * geometry.width;
}

export function miniChartY(value: number, geometry: MiniChartGeometry) {
  const safeValue = finiteMiniChartValue(value, geometry.min);
  return geometry.plotBottom - ((safeValue - geometry.min) / geometry.range) * (geometry.plotBottom - geometry.plotTop);
}

export function miniChartBarMax(values: number[]) {
  return Math.max(1, ...values.map((value) => Math.max(0, finiteMiniChartValue(value, 0))));
}

export function miniChartBarHeight(value: number, maxValue: number, maxHeight: number) {
  const safeValue = Math.max(0, finiteMiniChartValue(value, 0));
  const safeMaxValue = Math.max(1e-9, finiteMiniChartValue(maxValue, 1));
  const safeMaxHeight = Math.max(0, finiteMiniChartValue(maxHeight, 0));
  return (safeValue / safeMaxValue) * safeMaxHeight;
}

export function finiteMiniChartValue(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function xDomainForValues(values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (min !== max) return { min, max };
  return { min: min - 1, max: max + 1 };
}
