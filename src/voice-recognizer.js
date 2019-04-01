import axios from 'axios'
import Recorder from './recorder'
import { Trace, Error } from './log'
const AudioContext = window.AudioContext || window.webkitAudioContext

export default class VoiceRecognizer
{
    constructor(options)
    {
        this.audioContext = new AudioContext()
        this.options = Object.assign({ debug: false }, options)
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
                this.freqByteData = new Uint8Array(this.analyserNode.frequencyBinCount)
                audioInput.connect(this.analyserNode)
                resolve()
            })
            .catch(e =>
            {
                this.options.debug && Error(e)
                reject()
            })
        )
    }

    UpdateAnalysers()
    {
        this.analyserNode.getByteFrequencyData(this.freqByteData)
        window.requestAnimationFrame(evt => this.UpdateAnalysers())
    }

    Start()
    {
        this.options.debug && Trace('Recording...')
        this.audioRecorder.Clear()
        this.audioRecorder.Record()
        this.UpdateAnalysers()
    }

    Stop()
    {
        this.options.debug && Trace('Stop!!')
        this.audioRecorder.Stop()
    }

    Check()
    {
        const result = {}
        const freqMean = this.freqByteData.reduce((acc, val) => acc + +val, 0) / this.freqByteData.length
        this.options.debug && Trace(`Frequency Mean: ${freqMean}`)
        result.freqMean = freqMean
        if (!this.options.key)
            return Promise.resolve(result)

        return this.audioRecorder.GetBuffers(buffers => this.GotBuffers(buffers, result))
    }

    GotBuffers([buffers], result)
    {
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

                this.options.debug && Trace(`Send sample ...`)
                axios
                .post('https://speech.googleapis.com/v1/speech:recognize', requestData, { params: { key: this.options.key } })
                .then(({ data }) =>
                {
                    if (!data.results)
                    {
                        this.options.debug && Trace('Try again!!')
                        result.transcripts = null
                        return resolve(result)
                    }
                    const [{ alternatives }] = data.results
                    alternatives.forEach(({ transcript, confidence = 1 }) =>
                    {
                        this.options.debug && Trace(`* [${transcript}] ${(confidence*100).toFixed(2)}%`)
                    })
                    result.transcripts = alternatives
                    resolve(result)
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
