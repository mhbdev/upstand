import { createToken } from "@circulo-ai/di";
import type { IUnitOfWork } from "./repositories/unit-of-work.interface";

export const UnitOfWorkToken = createToken<IUnitOfWork>("IUnitOfWork");
