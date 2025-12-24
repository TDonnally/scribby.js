let text = ""
let interval: any = null
onmessage = (e) => {
    text += e.data[0];
    if (interval){
        clearInterval(interval)
    }
    console.log("message")
    interval = setInterval(() => {
        text = text.slice(1);
        postMessage("remove");
        if (!text){
           clearInterval(interval); 
        }
    }, 20);
};