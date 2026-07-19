import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "upstand-web",
  drain: createFsDrain({ maxFiles: 7 }),
});

export const { register, onRequestError } = createInstrumentation({
  service: "upstand-web",
});
