import { resolve } from "node:path";
import { probeLocalEnvironment } from "../evaluation/environment-capability/capabilities";

const report = probeLocalEnvironment(resolve("."));
console.log(`OMEGA_ENVIRONMENT_CAPABILITIES ${JSON.stringify(report)}`);
