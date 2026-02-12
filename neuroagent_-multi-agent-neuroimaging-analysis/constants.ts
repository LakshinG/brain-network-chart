import { AgentType } from './types';

export const AGENT_COLORS = {
  [AgentType.USER]: 'bg-slate-700 border-slate-600',
  [AgentType.PLANNER]: 'bg-indigo-900/50 border-indigo-700 text-indigo-200',
  [AgentType.EXECUTOR]: 'bg-emerald-900/50 border-emerald-700 text-emerald-200',
  [AgentType.RESEARCHER]: 'bg-purple-900/50 border-purple-700 text-purple-200',
  [AgentType.SYSTEM]: 'bg-gray-800 border-gray-700 text-gray-400',
};

export const MOCK_CSV_DATA = `ID,DX,Age,Sex,Amyloid_lS_orbital_med,Amyloid_lG_and_S_occipital_inf,Tau_Global
001,CN,72,F,1.1,1.05,0.8
002,CN,75,M,1.05,1.02,0.82
003,MCI,71,M,1.4,1.15,1.1
004,AD,80,F,1.8,1.45,1.5
005,MCI,68,F,1.35,1.12,1.05
006,CN,74,M,1.08,1.01,0.78
007,AD,82,M,1.9,1.50,1.6
008,LMCI,76,F,1.5,1.25,1.3
009,EMCI,69,M,1.25,1.10,0.95
010,AD,79,F,1.75,1.48,1.55
011,CN,70,F,1.02,0.99,0.75
012,MCI,73,M,1.38,1.20,1.15
013,LMCI,77,F,1.55,1.30,1.35
014,CN,71,M,1.06,1.03,0.81
015,AD,85,F,2.0,1.60,1.7
`;