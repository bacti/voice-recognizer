export const Trace = message =>
{
    const log = `${(window.performance.now() / 1000).toFixed(3)}: ${message + []}\n`
    console.warn(log)
    document.getElementById('log').innerText += log
}

export const Error = message =>
{
    const now = (window.performance.now() / 1000).toFixed(3)
    console.error(now + ': ', message + [])
}
