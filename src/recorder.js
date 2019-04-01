const BUFFER_SIZE = 4096
const BUFFER_MAX = BUFFER_SIZE * 24

export default class Recorder
{
    constructor(source, config = {})
    {
        this.config = config
        this.context = source.context

        const bufferSize = config.bufferSize || BUFFER_SIZE
        const scriptNode = this.context.createScriptProcessor(bufferSize, 1, 1)
        scriptNode.onaudioprocess = evt =>
        {
            if (!this.recording)
                return
            const buffersL = evt.inputBuffer.getChannelData(0)
            // const buffersR = evt.inputBuffer.getChannelData(1)

            if (this.recLength >= BUFFER_MAX)
            {
                this.recBuffersL.shift()
                // this.recBuffersR.shift()
                this.recLength -= buffersL.length    
            }

            this.recBuffersL.push(buffersL.slice())
            // this.recBuffersR.push(buffersR.slice())
            this.recLength += buffersL.length
        }
     
        source.connect(scriptNode)
        scriptNode.connect(this.context.destination)
    }

    Record()
    {
        this.recording = true
    }

    Stop()
    {
        this.recording = false
    }

    Clear()
    {
        this.recLength = 0
        this.recBuffersL = []
        // this.recBuffersR = []
    }

    GetBuffers(currCallback)
    {
        const buffers = []
        buffers.push(this.MergeBuffers(this.recBuffersL, this.recLength))
        // buffers.push(this.MergeBuffers(this.recBuffersR, this.recLength))
        return currCallback(buffers)
    }

    MergeBuffers(recBuffers, recLength)
    {
        const result = new Float32Array(recLength)
        let offset = 0
        for (let i = 0; i < recBuffers.length; i++)
        {
            result.set(recBuffers[i], offset)
            offset += recBuffers[i].length
        }
        return result
    }
}
