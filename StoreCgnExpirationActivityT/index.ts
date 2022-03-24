import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getStoreCgnExpirationActivityHandler } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(config.CGN_STORAGE_CONNECTION_STRING);

export const StoreCgnExpirationActivity = getStoreCgnExpirationActivityHandler(
  tableService,
  config.CGN_EXPIRATION_TABLE_NAME
);
