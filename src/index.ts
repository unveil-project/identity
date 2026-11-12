/**
 *
 * "You are given a calf-skin wallet on your birthday."
 *
 *     "I wouldn't accept it. Also I'd report the person who gave it
 *     to me to the police."
 *
 * "You have a little boy and he shows you his butterfly collection,
 * including his killing jar."
 *
 *     "I'd take him to the doctor."
 *
 * "You're sitting watching TV and suddenly you discover a wasp
 * crawling on your wrist."
 *
 *     "I'd kill it."
 *
 * Philip K. Dick, Do Androids Dream of Electric Sheep? (1968)
 *
 */
export { classify } from "./classify";
export { CONFIG as identityConfig } from "./config";
export type {
	Account,
	AccountInput,
	ActivityEvent,
	ActivityEventType,
	AnalyzeOptions,
	AnalyzeScope,
	Classification,
	ClassificationLabel,
} from "./types";
