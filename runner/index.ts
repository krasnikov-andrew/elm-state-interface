export interface ElmPorts {
    toJs: {
        subscribe: (callback: (fromElm: any) => void) => void
    }
    fromJs: { send: (toElm: any) => void }
}

export function programStart(appConfig: { ports: ElmPorts, domElement: HTMLElement }) {
    const interfaceWithoutSendToElmImplementations: { [key: string]: (config: any) => void } = {
        "addConsoleLog": (config) => { console.log(config) },
        "addConsoleWarn": (config) => { console.warn(config) },
        "addConsoleError": (config) => { console.error(config) },
        "addNavigationPushUrl": (config) => { pushUrl(config) },
        "addNavigationReplaceUrl": (config) => { replaceUrl(config) },
        "addNavigationGo": (config) => { go(config) },
        "addNavigationLoad": (config) => { load(config) },
        "addNavigationReload": (_config: null) => { reload() },
        "addFileDownloadUnsignedInt8s": (config) => { fileDownloadBytes(config) },
        "addClipboardReplaceBy": (config: string) => { navigator.clipboard.writeText(config) },
        "addAudio": addAudio,
        "addSocketDisconnect": (index: number) => {
            const socketToDisconnect = sockets.at(index)
            if (socketToDisconnect) {
                socketToDisconnect.close()
                sockets[index] = undefined
            } else { } // socket is already closed
        },
        "addSocketMessage": (config: { id: number, data: string }) => {
            const socketToDisconnect = sockets.at(config.id)
            if (socketToDisconnect) {
                socketToDisconnect.send(config.data)
            } else {
                console.warn("trying to send messages on closed socket")
            }
        },
        "addEditAudio": editAudio,
        "removeTimePeriodicallyListen": removeTimePeriodicallyListen,
        "removeDom": (_config: null) => { appConfig.domElement.replaceChildren() },
        "removeHttpRequest": (config: string) => {
            const maybeAbortController = httpRequestAbortControllers[config]
            if (maybeAbortController) {
                maybeAbortController.abort()
            }
        },
        "removeWindowEventListen": windowEventListenRemove,
        "removeAnimationFrameListen": (_config: null) => { removeAnimationFrameListen() },
        "removeDocumentEventListen": documentEventListenRemove,
        "removeAudio": removeAudio,
        "removeSocketConnect": (config: { address: string }) => {
            sockets
                .flatMap(socket => socket ? [socket] : [])
                .filter(socket => socket.url == config.address)
                .forEach(socketToStopFromConnecting => {
                    socketToStopFromConnecting.onopen = null
                })
        },
        "removeSocketDisconnectListen": (index: number) => {
            const socket = sockets.at(index)
            if (socket) {
                socket.onclose = null
            } else { } // already removed
        },
        "removeSocketMessageListen": (index: number) => {
            const socketToListenToMessagesFrom = sockets.at(index)
            if (socketToListenToMessagesFrom) {
                socketToListenToMessagesFrom.onmessage = null
            } else { } // already removed
        }
    }
    const interfaceWithSendToElmImplementations: { [key: string]: (config: any, sendToElm: (v: any) => void) => void } = {
        "addTimePosixRequest": (_config: null, sendToElm) => {
            sendToElm(Date.now())
        },
        "addTimezoneOffsetRequest": (_config: null, sendToElm) => {
            // Equivalent Elm Kernel code: https://github.com/elm/time/blob/1.0.0/src/Elm/Kernel/Time.js#L38-L52
            sendToElm(new Date().getTimezoneOffset())
        },
        "addTimezoneNameRequest": (_config: null, sendToElm) => {
            sendToElm(getTimezoneName())
        },
        "addTimePeriodicallyListen": (config, sendToElm) => {
            addTimePeriodicallyListen(config, sendToElm)
        },
        "addRandomUnsignedInt32sRequest": (config, sendToElm) => {
            sendToElm(crypto.getRandomValues(new Uint32Array(config)))
        },
        "addEditDom": (config, sendToElm) => {
            editDom(config.path, config.replacement, sendToElm)
        },
        "addHttpRequest": (config, sendToElm) => {
            const abortController = new AbortController()
            httpRequestAbortControllers[config] = abortController
            httpFetch(config, abortController).then(response => { sendToElm(response) })
        },
        "addWindowSizeRequest": (_config: null, sendToElm) => {
            sendToElm({ width: window.innerWidth, height: window.innerHeight })
        },
        "addWindowEventListen": windowEventListenAdd,
        "addWindowAnimationFrameListen": (_config: null, sendToElm) => {
            addAnimationFrameListen(sendToElm)
        },
        "addNavigationUrlRequest": (_config: null, sendToElm) => {
            sendToElm(window.location.href)
        },
        "addDocumentEventListen": documentEventListenAdd,
        "addClipboardRequest": (_config: null, sendToElm) => {
            navigator.clipboard.readText().then(sendToElm)
        },
        "addAudioSourceLoad": audioSourceLoad,
        "addSocketConnect": (config: { address: string }, sendToElm) => {
            const createdSocket = new WebSocket(config.address)
            sockets.push(createdSocket)
            createdSocket.onopen = _event => {
                sendToElm(sockets.length)
                createdSocket.onopen = null
            }
        },
        "addSocketDisconnectListen": (index: number, sendToElm) => {
            const socketToDisconnect = sockets.at(index)
            if (socketToDisconnect) {
                socketToDisconnect.onclose = (event) => {
                    sendToElm({ code: event.code, reason: event.reason })
                }
            } else { } // socket is already closed
        },
        "addSocketMessageListen": (index: number, sendToElm) => {
            const socketToListenToMessagesFrom = sockets.at(index)
            if (socketToListenToMessagesFrom) {
                socketToListenToMessagesFrom.onmessage = (event) => {
                    sendToElm(event.data)
                }
            } else {
                console.warn("trying to listen to messages on closed socket")
            }
        }
    }


    appConfig.ports.toJs.subscribe(function (fromElm) {
        // console.log("elm → js: ", fromElm)
        function sendToElm(eventData: void) {
            const toElm = { diff: fromElm, eventData: eventData }
            appConfig.ports.fromJs.send(toElm)
            // console.log("js → elm: ", toElm)
        }
        const diff: [string, unknown] | undefined = Object.entries(fromElm)[0]
        if (diff) {
            const [diffKind, diffConfig] = diff
            const maybeAssociatedAddOrReplaceFunction = interfaceWithSendToElmImplementations[diffKind]
            if (maybeAssociatedAddOrReplaceFunction) {
                maybeAssociatedAddOrReplaceFunction(diffConfig, sendToElm)
            } else {
                const associatedRemoveFunction = interfaceWithoutSendToElmImplementations[diffKind]
                if (associatedRemoveFunction) {
                    associatedRemoveFunction(diffConfig)
                } else {
                    console.error("Unknown message kind " + diffKind + " from elm. Maybe you have a typo? Otherwise the associated js function might be missing.")
                }
            }
        } else {
            console.error("I got the message {} from elm but I need a specific command as { actionToPerform : config }")
        }
    })

    function editDom(path: number[], replacement: any, sendToElm: (v: any) => void) {
        if (path.length === 0) {
            const parentDomNode = appConfig.domElement
            if (replacement?.node) {
                parentDomNode.replaceChildren() // remove all subs
                parentDomNode.appendChild(createDomNode([], replacement.node, sendToElm))
            } else {
                editDomModifiers(parentDomNode.firstChild as (Element & ElementCSSInlineStyle), replacement, path, sendToElm)
            }
        } else {
            let parentDomNode: ChildNode | null = appConfig.domElement.firstChild
            if (parentDomNode) {
                path.slice(1, path.length).reverse().forEach(subIndex => {
                    const subNode = parentDomNode?.childNodes[subIndex]
                    if (subNode) {
                        parentDomNode = subNode
                    }
                })
                const oldDomNode: ChildNode | undefined = parentDomNode.childNodes[path[0] ?? 0]
                if (oldDomNode) {
                    if (replacement?.node) {
                        parentDomNode.replaceChild(createDomNode([], replacement.node, sendToElm), oldDomNode)
                    } else {
                        editDomModifiers(oldDomNode as (Element & ElementCSSInlineStyle), replacement, path, sendToElm)
                    }
                }
            }
        }
    }
}

let sockets: (WebSocket | undefined)[] = []

let eventListenerAbortControllers: { domElement: Element, abortController: AbortController }[] = []
function editDomModifiers(domNodeToEdit: Element & ElementCSSInlineStyle, replacement: any, path: number[], sendToElm: (v: any) => void) {
    if (replacement?.styles) {
        domNodeToEdit.removeAttribute("style")
        domElementAddStyles(domNodeToEdit, replacement.styles)
    } else if (replacement?.attributes) {
        for (const attribute of domNodeToEdit.attributes) {
            if (attribute.name !== "style" && attribute.namespaceURI === null) {
                domNodeToEdit.removeAttribute(attribute.name)
            }
        }
        domElementAddAttributes(domNodeToEdit, replacement.attributes)
    } else if (replacement?.attributesNamespaced) {
        for (const attribute of domNodeToEdit.attributes) {
            if (attribute.name !== "style" && attribute.namespaceURI) {
                domNodeToEdit.removeAttributeNS(attribute.namespaceURI, attribute.name)
            }
        }
        domElementAddAttributesNamespaced(domNodeToEdit, replacement.attributesNamespaced)
    } else if (replacement?.eventListens) {
        eventListenerAbortControllers = eventListenerAbortControllers
            .filter(eventListener => {
                if (eventListener.domElement === domNodeToEdit) {
                    eventListener.abortController.abort()
                    return false
                }
                return true
            })
        domElementAddEventListens(domNodeToEdit, replacement.eventListens, path, sendToElm)
    } else {
        console.error("unknown replacement kind", replacement)
    }
}

const httpRequestAbortControllers: { [key: string]: AbortController } = {}

const timePeriodicallyListens: { [key: number]: number } = {}
function addTimePeriodicallyListen(intervalDuration: { milliSeconds: number }, sendToElm: (v: any) => void) {
    timePeriodicallyListens[intervalDuration.milliSeconds] =
        window.setInterval(
            () => { sendToElm(Date.now()) },
            intervalDuration.milliSeconds
        )
}
function removeTimePeriodicallyListen(intervalDuration: { milliSeconds: number }) {
    const maybeTimePeriodicallyListen = timePeriodicallyListens[intervalDuration.milliSeconds]
    if (maybeTimePeriodicallyListen) {
        window.clearInterval(maybeTimePeriodicallyListen)
    }
}

// Equivalent Elm Kernel code: https://github.com/elm/time/blob/1.0.0/src/Elm/Kernel/Time.js#L27-L35
function getTimezoneName(): string | number {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (err) {
        return new Date().getTimezoneOffset()
    }
}

function createDomNode(innerPath: number[], node: any, sendToElm: (v: any) => void): Element | Text {
    if (node?.text) {
        return document.createTextNode(node.text)
    } else { // if (node?.element)
        const createdDomElement: (Element & ElementCSSInlineStyle) =
            node.element?.namespace ?
                document.createElementNS(node.element.namespace, noScript(node.element.tag))
                :
                document.createElement(noScript(node.element.tag))

        domElementAddAttributes(createdDomElement, node.element.attributes)
        domElementAddAttributesNamespaced(createdDomElement, node.element.attributesNamespaced)
        domElementAddStyles(createdDomElement, node.element.styles)
        domElementAddEventListens(createdDomElement, node.element.eventListens, innerPath, sendToElm)
        node.element.subs.forEach((sub: any, subIndex: number) => {
            createdDomElement.appendChild(
                createDomNode([subIndex].concat(innerPath), sub, sendToElm)
            )
        })
        return createdDomElement
    }
}
function domElementAddStyles(domElement: Element & ElementCSSInlineStyle, styles: any) {
    for (let [styleKey, styleValue] of Object.entries(styles)) {
        domElement.style.setProperty(styleKey, styleValue as string)
    }
}
function domElementAddAttributes(domElement: Element, attributes: { [key: string]: string }) {
    for (let [attributeKey, attributeValue] of Object.entries(attributes)) {
        if (RE_js_html.test(attributeValue)) {
            console.error("This is an XSS vector. Please use an interface instead.")
        } else if (attributeKey === "src" && RE_js_html.test(attributeValue)) {
            console.error("This is an XSS vector. Please use an interface instead.")
        } else if (attributeKey === "action" || attributeKey === "href" && RE_js.test(attributeValue)) {
            console.error("This is an XSS vector. Please use an interface instead.")
        } else {
            domElement.setAttribute(
                noOnOrFormAction(attributeKey),
                attributeValue
            )
        }
    }
}
function domElementAddAttributesNamespaced(domElement: Element, attributesNamespaced: any) {
    attributesNamespaced.forEach((attributeNamespaced: { namespace: string, key: string, value: string }) => {
        domElement.setAttributeNS(attributeNamespaced.namespace, attributeNamespaced.key, attributeNamespaced.value)
    })
}
function domElementAddEventListens(domElement: Element, eventListens: any, path: number[], sendToElm: (v: any) => void) {
    for (let [eventListenName, defaultActionHandling] of Object.entries(eventListens)) {
        const abortController: AbortController = new AbortController()
        domElement.addEventListener(
            eventListenName,
            (triggeredEvent) => {
                sendToElm({ innerPath: path, name: eventListenName, event: triggeredEvent })
                if (defaultActionHandling === "DefaultActionPrevent") {
                    triggeredEvent.preventDefault()
                }
            },
            { signal: abortController.signal }
        )
        eventListenerAbortControllers.push({ domElement: domElement, abortController: abortController })
    }
}

// copied and edited from https://github.com/elm/virtual-dom/blob/master/src/Elm/Kernel/VirtualDom.js
// XSS ATTACK VECTOR CHECKS
//
// For some reason, tabs can appear in href protocols and it still works.
// So '\tjava\tSCRIPT:alert("!!!")' and 'javascript:alert("!!!")' are the same
// in practice. That is why RE_js and RE_js_html look
// so freaky.

const RE_script = /^script$/i
var RE_on_formAction = /^(on|formAction$)/i;
var RE_js = /^\s*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i;
var RE_js_html = /^\s*(j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l\s*(,|;))/i;

function noScript(tag: string) {
    return RE_script.test(tag) ? 'p' : tag
}
function noOnOrFormAction(key: string) {
    return RE_on_formAction.test(key) ? "data-" + key : key
}


function windowEventListenAdd(eventName: string, sendToElm: (v: any) => void) {
    (window as { [key: string]: any })["on" + eventName] = sendToElm
}
function windowEventListenRemove(eventName: string) {
    (window as { [key: string]: any })["on" + eventName] = null
}

function documentEventListenAdd(eventName: string, sendToElm: (v: any) => void) {
    (window as { [key: string]: any })["on" + eventName] = sendToElm
}
function documentEventListenRemove(eventName: string) {
    (window as { [key: string]: any })["on" + eventName] = null
}

function go(urlSteps: number) {
    history.go(urlSteps)
}
function pushUrl(appUrl: string) {
    if (history.state === null || (history.state.appUrl !== appUrl)) {
        history.pushState({ appUrl: appUrl }, "", window.location.origin + appUrl)
    }
}
function replaceUrl(appUrl: string) {
    history.replaceState({ appUrl: appUrl }, "", window.location.origin + appUrl)
}

function reload() {
    document.location.reload()
}
function load(url: string) {
    try {
        window.location.href = url
    } catch (err) {
        // Only Firefox can throw a NS_ERROR_MALFORMED_URI exception here.
        // Other browsers reload the page, so let's be consistent about that.
        reload()
    }
}

let runningAnimationFrameLoopId: number | undefined = undefined
function addAnimationFrameListen(sendToElm: (v: any) => void) {
    runningAnimationFrameLoopId =
        window.requestAnimationFrame(_timestamp => {
            if (runningAnimationFrameLoopId) {
                sendToElm(Date.now())
                addAnimationFrameListen(sendToElm)
            }
        })
}
function removeAnimationFrameListen() {
    if (runningAnimationFrameLoopId) {
        window.cancelAnimationFrame(runningAnimationFrameLoopId)
        runningAnimationFrameLoopId = undefined
    }
}

function fileDownloadBytes(config: { mimeType: string, name: string, content: number[] }) {
    const temporaryAnchorDomElement: HTMLAnchorElement = window.document.createElement('a')
    const blob = new Blob(
        [new Uint8Array(config.content)],
        { type: config.mimeType }
    )
    const objectUrl = URL.createObjectURL(blob)
    temporaryAnchorDomElement.href = objectUrl
    temporaryAnchorDomElement.download = config.name
    const event = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
    })
    document.body.appendChild(temporaryAnchorDomElement)
    temporaryAnchorDomElement.dispatchEvent(event)
    document.body.removeChild(temporaryAnchorDomElement)
    URL.revokeObjectURL(objectUrl)
}

interface HttpRequest {
    url: string
    method: string
    headers: [name: string, value: string][]
    expect: Expect
    timeout: number | null
    body: string | null
}
type Expect = "STRING" | "WHATEVER"

type HttpResponse = { ok: ResponseSuccess } | { err: any }
interface ResponseSuccess {
    body: any | string | null
    url: string
    headers: { [header: string]: string }
    statusCode: number
    statusText: string
}

function httpFetch(request: HttpRequest, abortController: AbortController): Promise<HttpResponse> {
    if (request.timeout) {
        setTimeout(() => abortController.abort(), request.timeout)
    }
    return fetch(request.url, {
        method: request.method,
        body: request.body || null,
        headers: new Headers(request.headers),
        signal: abortController.signal,
    })
        .then((res: Response) => {
            const headers = Object.fromEntries(res.headers.entries())
            switch (request.expect) {
                case "STRING": {
                    return res.text().then((x) => ({
                        ok: {
                            url: res.url,
                            headers: headers,
                            statusCode: res.status,
                            statusText: res.statusText,
                            body: x || null,
                        }
                    }))
                }
                case "WHATEVER": {
                    return {
                        ok: {
                            url: res.url,
                            headers: headers,
                            statusCode: res.status,
                            statusText: res.statusText,
                            body: null,
                        }
                    }
                }
            }
        })
        .catch((e) => { return { err: e } })
}


type AudioInfo = {
    url: string,
    startTime: number,
    volume: AudioParameterTimeline,
    speed: AudioParameterTimeline,
    stereoPan: AudioParameterTimeline,
    linearConvolutions: { sourceUrl: string }[],
    lowpasses: { cutoffFrequency: AudioParameterTimeline }[],
    highpasses: { cutoffFrequency: AudioParameterTimeline }[]
}
type AudioParameterTimeline = {
    startValue: number,
    keyFrames: { time: number, value: number }[]
}

const audioBuffers: { [key: string]: AudioBuffer } = {}
const audioContext = new AudioContext()
let audioPlaying: {
    url: string,
    startTime: number,
    sourceNode: AudioBufferSourceNode,
    gainNode: GainNode,
    stereoPanNode: StereoPannerNode,
    processingNodes: AudioNode[]
}[] = []

function audioSourceLoad(url: string, sendToElm: (v: any) => void) {
    const request = new XMLHttpRequest()
    request.open("GET", url, true)
    request.responseType = "arraybuffer"
    request.onerror = function () {
        sendToElm({ err: "NetworkError" })
    }
    request.onload = function () {
        audioContext.decodeAudioData(
            request.response,
            function (buffer) {
                audioBuffers[url] = buffer
                sendToElm({
                    ok: {
                        durationInSeconds: buffer.length / buffer.sampleRate
                    }
                })
            },
            function (error) {
                sendToElm({ err: error.message })
            }
        )
    }
    request.send()
}

function audioParameterTimelineApplyTo(audioParam: AudioParam, timeline: AudioParameterTimeline) {
    const currentTime = audioContext.currentTime
    audioParam.cancelScheduledValues(currentTime)
    const fullTimeline = [
        { time: currentTime, value: timeline.startValue },
        ...timeline.keyFrames.map(keyframe => { return { value: keyframe.value, time: posixToContextTime(keyframe.time, currentTime) } })
    ]
    forEachConsecutive(fullTimeline, pair => {
        if (currentTime >= pair.current.time) {
            audioParam.setValueAtTime(
                linearlyInterpolate(
                    pair.current.value,
                    pair.next.value,
                    // since start / duration
                    (currentTime - pair.current.time) / (pair.next.time - pair.current.time)
                ),
                0
            )
        }
        audioParam.linearRampToValueAtTime(pair.next.value, pair.next.time - pair.current.time)
    })
    return audioParam
}

function addAudio(config: AudioInfo) {
    const buffer = audioBuffers[config.url]
    if (buffer) {
        createAudio(config, buffer)
    } else {
        console.warn("lue-bird/elm-state-interface: tried to play audio from source that isn't loaded. Did you use Web.Audio.sourceLoad?")
    }
}
function createAudio(config: AudioInfo, buffer: AudioBuffer) {
    const currentTime = new Date().getTime()
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    audioParameterTimelineApplyTo(source.playbackRate, config.speed)

    const gainNode = audioContext.createGain()
    audioParameterTimelineApplyTo(gainNode.gain, config.volume)

    const stereoPannerNode = new StereoPannerNode(audioContext)
    audioParameterTimelineApplyTo(stereoPannerNode.pan, config.stereoPan)

    const processingNodes = createProcessingNodes(config)

    forEachConsecutive(
        [source, gainNode, stereoPannerNode, ...processingNodes, audioContext.destination],
        pair => { pair.current.connect(pair.next) }
    )

    if (config.startTime >= currentTime) {
        source.start(posixToContextTime(config.startTime, currentTime), 0)
    } else {
        source.start(0, (currentTime - config.startTime) / 1000)
    }
    audioPlaying.push({
        url: config.url,
        startTime: config.startTime,
        sourceNode: source,
        gainNode: gainNode,
        stereoPanNode: stereoPannerNode,
        processingNodes: processingNodes,
    })
}
function createProcessingNodes(config: {
    linearConvolutions: { sourceUrl: string }[],
    lowpasses: { cutoffFrequency: AudioParameterTimeline }[],
    highpasses: { cutoffFrequency: AudioParameterTimeline }[]
}): AudioNode[] {
    const convolverNodes =
        config.linearConvolutions
            .map(linearConvolution => {
                const convolverNode = new ConvolverNode(audioContext)
                const buffer = audioBuffers[linearConvolution.sourceUrl]
                if (buffer) {
                    convolverNode.buffer = buffer
                } else {
                    console.warn("lue-bird/elm-state-interface: tried to create a linear convolution from source that isn't loaded. Did you use Web.Audio.sourceLoad?")
                }
                return convolverNode
            })

    const lowpassNodes =
        config.lowpasses
            .map(lowpass => {
                const biquadNode = new BiquadFilterNode(audioContext)
                biquadNode.type = "lowpass"
                audioParameterTimelineApplyTo(biquadNode.frequency, lowpass.cutoffFrequency)
                return biquadNode
            })

    const highpassNodes =
        config.highpasses
            .map(highpass => {
                const biquadNode = new BiquadFilterNode(audioContext)
                biquadNode.type = "highpass"
                audioParameterTimelineApplyTo(biquadNode.frequency, highpass.cutoffFrequency)
                return biquadNode
            })
    return [...convolverNodes, ...lowpassNodes, ...highpassNodes]
}
function removeAudio(config: { url: string, startTime: number }) {
    audioPlaying = audioPlaying.filter(audio => {
        if (audio.url === config.url && audio.startTime === config.startTime) {
            audio.sourceNode.stop()
            audio.sourceNode.disconnect()
            audio.gainNode.disconnect()
            audio.stereoPanNode.disconnect()
            audio.processingNodes.forEach(node => { node.disconnect() })
            return false
        }
        return true
    })
}
function editAudio(config: { url: string, startTime: number, replacement: any }) {
    audioPlaying.forEach(value => {
        if (value.url === config.url && value.startTime === config.startTime) {
            if (config.replacement?.volume) {
                audioParameterTimelineApplyTo(value.gainNode.gain, config.replacement.volume)
            } else if (config.replacement?.speed) {
                audioParameterTimelineApplyTo(value.sourceNode.playbackRate, config.replacement.speed)
            } else if (config.replacement?.stereoPan) {
                audioParameterTimelineApplyTo(value.stereoPanNode.pan, config.replacement.stereoPan)
            } else if (config.replacement?.processing) {
                value.stereoPanNode.disconnect()
                value.processingNodes.forEach(node => { node.disconnect() })

                value.processingNodes = createProcessingNodes(config.replacement.processing)

                forEachConsecutive(
                    [value.stereoPanNode, ...value.processingNodes, audioContext.destination],
                    pair => { pair.current.connect(pair.next) }
                )
            }
        }
    })
}

// helpers

function posixToContextTime(posix: number, currentTimePosix: number) {
    return (posix - currentTimePosix) / 1000 + audioContext.currentTime
}

function linearlyInterpolate(startValue: number, endValue: number, progress: number) {
    return Number.isFinite(progress) ?
        progress * (endValue - startValue) + startValue
        :
        startValue
}

function forEachConsecutive<element>(array: element[], forPair: ((pair: { current: element, next: element }) => void)) {
    for (let i = 0; i <= array.length - 2; i++) {
        const current: element | undefined = array[i]
        const next: element | undefined = array[i + 1]
        if (current && next) { // should always work
            forPair({ current: current, next: next })
        }
    }
}
