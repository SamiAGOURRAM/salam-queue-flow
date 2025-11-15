import { ClinicEstimationConfig, EstimationMode } from "../models/QueueModels";
import { BasicWaitTimeEstimator } from "./BasicWaitTimeEstimator";
import { SimulatedMlWaitTimeEstimator } from "./SimulatedMlWaitTimeEstimator";
import { WaitTimeEstimator } from "./types";

export class QueueEstimatorFactory {
  private readonly basicEstimator = new BasicWaitTimeEstimator();
  private readonly simulatedMlEstimator = new SimulatedMlWaitTimeEstimator();

  getEstimator(config: ClinicEstimationConfig): WaitTimeEstimator {
    if (config.estimationMode === 'ml' && config.mlEnabled) {
      return this.simulatedMlEstimator;
    }

    if (config.estimationMode === 'hybrid') {
      return config.mlEnabled ? this.simulatedMlEstimator : this.basicEstimator;
    }

    return this.basicEstimator;
  }

  getFallback(mode: EstimationMode): WaitTimeEstimator {
    if (mode === 'ml') {
      return this.simulatedMlEstimator;
    }
    return this.basicEstimator;
  }
}
