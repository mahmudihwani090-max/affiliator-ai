export function getAppVersion() {
    return (
        process.env.NEXT_PUBLIC_APP_VERSION ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.COMMIT_SHA ||
        process.env.RENDER_GIT_COMMIT ||
        "dev"
    )
}