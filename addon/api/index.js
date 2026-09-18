function clean(v){return String(v||"").trim();}
function enc(v){return encodeURIComponent(String(v||""));}
function json(url,options){return fetch(url,options||{}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();});}
function response(res,status,data){res.status(status);res.setHeader("Cache-Control","no-store");res.json(data);}

async function handler(req,res){
  try{
    var p=req.query||{};
    var type=p.type||"manifest";
    if(type==="manifest"){
      return response(res,200,{
        id:"vn-global-video",
        version:"1.0.0",
        name:"VN Global Video",
        description:"Public and authorized video discovery addon for Nuvio.",
        resources:["catalog","meta","stream"],
        types:["movie","series"],
        catalogs:[{type:"movie",id:"vn-global",name:"VN Global Video",extra:[{name:"search",isRequired:true}]},{type:"series",id:"vn-global",name:"VN Global Video",extra:[{name:"search",isRequired:true}]}]
      });
    }
    if(type==="catalog"){
      return response(res,200,{metas:[]});
    }
    if(type==="meta"){
      return response(res,200,{meta:{id:p.id,type:p.mediaType||"movie",name:p.title||"VN Global Video"}});
    }
    if(type==="stream"){
      var title=clean(p.title);
      if(!title) return response(res,200,{streams:[]});
      var dm=await json("https://api.dailymotion.com/videos?search="+enc(title)+"&fields=id,title,status&limit=10").catch(function(){return {list:[]};});
      var list=dm&&dm.list?dm.list:[];
      var streams=[];
      for(var i=0;i<list.length;i++){
        var item=list[i];
        if(!item||!item.id)continue;
        if(item.status&&item.status!=="published")continue;
        streams.push({
          name:"Dailymotion",
          title:item.title||title,
          url:"https://geo.dailymotion.com/player.html?video="+enc(item.id),
          behaviorHints:{bingeGroup:"dailymotion"}
        });
      }
      return response(res,200,{streams:streams.slice(0,10)});
    }
    return response(res,404,{error:"Unknown endpoint"});
  }catch(e){return response(res,500,{error:clean(e&&e.message)||"Internal error"});}
}

module.exports=handler;
