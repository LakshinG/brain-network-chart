import agingCurves from '../data/agingCurves.json';

type AgingCurvePayload = {
  X: number[];
  centiles: number[][];
};

type AgingCurveMap = Record<string, AgingCurvePayload>;

const CURVE_INDEX = agingCurves as AgingCurveMap;

export const AGING_CURVE_PHENOTYPES = Object.keys(CURVE_INDEX);

export const getAgingCurveData = async (phenotype: string): Promise<AgingCurvePayload> => {
  const { default: agingCurves } = await import('../data/agingCurves.json');
  const curve = (agingCurves as AgingCurveMap)[phenotype];
  if (!curve) {
    throw new Error(`Phenotype not found: ${phenotype}. Available phenotypes: ${AGING_CURVE_PHENOTYPES.join(', ')}`);
  }
  return curve;
};
