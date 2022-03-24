import { getGetProfile, getSendMessage } from "../utils/notifications";
import { getSendMessageActivityHandler } from "./handler";

const mockSendMessage: ReturnType<typeof getSendMessage> = async (...args) => {
  console.log(">> message sent", ...args);
  return 201;
};

const mockGetProfile: ReturnType<typeof getGetProfile> = async () => {
  console.log(">> profile found");
  return 200;
};

export const SendMessageActivity = getSendMessageActivityHandler(
  mockGetProfile,
  mockSendMessage
);
