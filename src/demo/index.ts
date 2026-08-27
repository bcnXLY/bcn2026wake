/**
 * Centralised mock data for demo mode. Keeping it here keeps the service and
 * context files focused on real logic — they import these fallbacks instead of
 * embedding sample data inline.
 */
export { DEMO_PROFILE } from './profile';
export { demoDirectory } from './contacts';
export { demoAlbums, demoGalleryImages } from './gallery';
export { demoBoard, demoPostMessage, demoDeleteMessage } from './messages';
export { demoFetchGameState, demoSubmitAward, demoHistory } from './game';
