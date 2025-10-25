export class IVodSync {
    constructor(){
        this.vodSyncClassName = this.constructor.name;
    }
    log(...data){
        logToExtension(`[${this.vodSyncClassName}]`, ...data);
    }
    warn(...data){
        warnToExtension(`[${this.vodSyncClassName}]`, ...data);
    }
    error(...data){
        errorToExtension(`[${this.vodSyncClassName}]`, ...data);
    }
}