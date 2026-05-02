export const SLITHER_TO_AEVA_CLASS: Record<string, string> = {
  "unchecked-lowlevel": "R007_UNCHECKED_LOW_LEVEL_CALL",
  "unchecked-send": "R007_UNCHECKED_LOW_LEVEL_CALL",

  "controlled-delegatecall": "R010_DELEGATECALL_SELFDESTRUCT",
  "delegatecall-loop": "R010_DELEGATECALL_SELFDESTRUCT",
  "suicidal": "R010_DELEGATECALL_SELFDESTRUCT",

  "reentrancy-eth": "R002_REENTRANCY_ORDERING",
  "reentrancy-no-eth": "R002_REENTRANCY_ORDERING",
  "reentrancy-benign": "R002_REENTRANCY_ORDERING",

  "arbitrary-send-eth": "R003_MISSING_ACCESS_CONTROL",
  "arbitrary-send-erc20": "R003_MISSING_ACCESS_CONTROL",
  "arbitrary-send-erc20-permit": "R003_MISSING_ACCESS_CONTROL",

  "timestamp": "R006_TIMESTAMP_DEPENDENCE",

  "calls-loop": "R008_UNBOUNDED_LOOP_RISK",

  "divide-before-multiply": "R005_PRECISION_ROUNDING"
};
