import axios from 'axios'
import Recorder from './recorder'
import { Trace, Error } from './log'
const AudioContext = window.AudioContext || window.webkitAudioContext

export default class VoiceRecognizer
{
    constructor(options = {})
    {
        this.audioContext = new AudioContext()
        this.options = options
    }

    Initialize()
    {
        return new Promise((resolve, reject) =>
            navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream =>
            {
                const audioInput = this.audioContext.createMediaStreamSource(stream)
                this.audioRecorder = new Recorder(audioInput)
                this.analyserNode = this.audioContext.createAnalyser()
                this.analyserNode.fftSize = 2048
                audioInput.connect(this.analyserNode)
                resolve()
            })
            .catch(e =>
            {
                Error(e)
                reject()
            })
        )
    }

    UpdateAnalysers()
    {
        const freqByteData = new Uint8Array(this.analyserNode.frequencyBinCount)
        this.analyserNode.getByteFrequencyData(freqByteData)
        window.requestAnimationFrame(evt => this.UpdateAnalysers())
    }

    Start()
    {
        Trace('Recording...')
        this.audioRecorder.Clear()
        this.audioRecorder.Record()
        this.UpdateAnalysers()
    }

    Stop()
    {
        Trace('Stop!!')
        this.audioRecorder.Stop()
    }

    Check()
    {
        return this.audioRecorder.GetBuffers(buffers => this.GotBuffers(buffers))
    }

    GotBuffers([buffers])
    {
        const freqByteData = new Uint8Array(this.analyserNode.frequencyBinCount)
        this.analyserNode.getByteFrequencyData(freqByteData)
        const freqMean = freqByteData.reduce((acc, val) => acc + +val, 0) / freqByteData.length
        Trace(`Frequency Mean: ${freqMean}`)

        if (!this.options.key)
            return Promise.resolve()

        return this.DownSampleBuffer(this.audioContext, buffers, 16000)
            .then(buffers => new Promise(resolve =>
            {
                const linear16 = Int16Array.from(buffers, x => x * 32767)
                const base64 = btoa(String.fromCharCode(...new Uint8Array(linear16.buffer)))
                const requestData =
                {
                    'audio': {
                        'content': base64
                    },
                    'config': {
                        'enableAutomaticPunctuation': false,
                        'encoding': 'LINEAR16',
                        'languageCode': 'en-US',
                        'sampleRateHertz': 16000,
                        'maxAlternatives': 30
                    }
                }

                Trace(`Send sample ...`)
                axios
                .post('https://speech.googleapis.com/v1/speech:recognize', requestData, { params: { key: this.options.key } })
                .then(({ data }) =>
                {
                    if (!data.results)
                    {
                        Trace('Try again!!')
                        return resolve()
                    }
                    const [{ alternatives }] = data.results
                    alternatives.forEach(({ transcript, confidence = 1 }) =>
                    {
                        Trace(`* [${transcript}] ${(confidence*100).toFixed(2)}%`)
                    })
                    resolve()
                })
            }))
    }

    DownSampleBuffer(context, sourceBuffer, targetRate)
    {
        return new Promise(resolve =>
        {
            if (targetRate == context.sampleRate)
            {
                resolve(sourceBuffer)
                return
            }
            if (targetRate > context.sampleRate)
                throw 'downsampling rate show be smaller than original sample rate'

            const sampleRateRatio = context.sampleRate / targetRate
            const newLength = Math.round(sourceBuffer.length / sampleRateRatio)
            const result = new Float32Array(newLength)
            let offsetResult = 0
            let offsetBuffer = 0
            while (offsetResult < result.length)
            {
                const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)
                let accum = 0, count = 0
                for (var i = offsetBuffer; i < nextOffsetBuffer && i < sourceBuffer.length; i++)
                {
                    accum += sourceBuffer[i]
                    count++
                }
                result[offsetResult] = accum / count
                offsetResult++
                offsetBuffer = nextOffsetBuffer
            }
            resolve(result)
        })
    }
}
