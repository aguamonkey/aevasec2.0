export type SlitherOutput = {
  success: boolean;
  error: string | null;
  results?: {
    detectors?: SlitherDetectorResult[];
  };
};

export type SlitherDetectorResult = {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements?: SlitherElement[];
  additional_fields?: Record<string, unknown>;
};

export type SlitherElement = {
  type?: string;
  name?: string;
  source_mapping?: {
    start?: number;
    length?: number;
    filename_relative?: string;
    filename_absolute?: string;
    filename_short?: string;
    filename_used?: string;
    lines?: number[];
    starting_column?: number;
    ending_column?: number;
  };
  type_specific_fields?: Record<string, unknown>;
  additional_fields?: Record<string, unknown>;
};
