export function shouldShowUserAttribution(settings) {
  return Boolean(settings?.show_user_attribution);
}

export function workspaceUserCount(settings) {
  return Number(settings?.workspace_user_count || 0);
}
