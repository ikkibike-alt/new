(function(){
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var has=function(list,k){return (" "+list+" ").indexOf(" "+k+" ")>-1};
  function hashKey(){try{return decodeURIComponent((location.hash||"").slice(1));}catch(_){return ""}}
  function setHash(k){try{history.replaceState(null,"",k==="all"?location.pathname:"#"+k);}catch(_){}}
  function setOn(group,btn){$$("button",group).forEach(function(x){x.classList.toggle("on",x===btn)});}

  /* ページを開いたら必ず一番上から */
  try{history.scrollRestoration="manual";}catch(_){}
  var toTop=function(){window.scrollTo(0,0);};
  toTop();window.addEventListener("pageshow",toTop);

  /* ブログ・Instagram・YouTube：遷移先の画像を表示。読み込めなければ何も出さない */
  $$("img.remote").forEach(function(img){
    var srcs=(img.dataset.srcs||"").split("|"),i=0,a=img.closest("a");
    var drop=function(){if(img.parentNode)img.parentNode.removeChild(img);};
    var next=function(){if(i>=srcs.length){drop();return;}img.src=srcs[i++];};
    img.referrerPolicy="no-referrer";
    img.addEventListener("error",next);
    img.addEventListener("load",function(){
      if(img.naturalWidth<2){next();return;}
      img.hidden=false;if(a){a.classList.remove("noimg");if(img.classList.contains("av"))a.classList.add("hasav");}
    });
    next();
  });

  /* 最新トピック：テーマ絞り込み */
  var nf=$("#newsFilter");
  if(nf){
    var apply=function(t){
      var n=0;
      $$("#newsList > li").forEach(function(li){if(li.classList.contains("divider")){li.hidden=t!=="all";return;}var ok=t==="all"||has(li.dataset.themes,t);li.hidden=!ok;if(ok)n++;});
      setOn(nf,$('[data-t="'+t+'"]',nf));
      $("#newsCount").textContent=n+" ITEMS";
    };
    nf.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;apply(b.dataset.t);setHash(b.dataset.t);});
    apply($('[data-t="'+hashKey()+'"]',nf)?hashKey():"all");
  }

  /* テーマページ：種類で絞り込み */
  var ff=$("#feedFilter");
  if(ff){
    ff.addEventListener("click",function(e){
      var b=e.target.closest("button");if(!b)return;var k=b.dataset.k,n=0;
      $$("#feedList > li").forEach(function(li){var ok=k==="all"||li.dataset.kind===k;li.hidden=!ok;if(ok)n++;});
      setOn(ff,b);$("#feedCount").textContent=n+" ITEMS";
    });
  }

  /* 発信者：性別・SNS・タイプ */
  var cf=$("#creatorFilter");
  if(cf){
    var st={g:"all",p:"all",y:"all"};
    var run=function(){
      var n=0;
      $$("#creatorList > li").forEach(function(li){
        var ok=(st.g==="all"||li.dataset.g===st.g)&&(st.p==="all"||li.dataset.p===st.p)&&(st.y==="all"||has(li.dataset.types,st.y));
        li.hidden=!ok;if(ok)n++;
      });
      $("#creatorCount").textContent=n+" CREATORS";
      $("#creatorEmpty").hidden=n>0;
      var b=$('#typeRow [data-y="'+st.y+'"]');
      $("#typeDesc").textContent=st.y==="all"?"考え方のタイプを選ぶと、近い発信者に絞り込めます。":b.dataset.desc;
    };
    cf.addEventListener("click",function(e){
      var b=e.target.closest("button");if(!b)return;
      var k=b.dataset.g?"g":b.dataset.p?"p":b.dataset.y?"y":null;if(!k)return;
      st[k]=b.dataset[k];setOn(b.parentNode,b);
      if(k==="y")setHash(st.y);
      run();
    });
    var h=hashKey(),tb=$('#typeRow [data-y="'+h+'"]');
    if(tb){st.y=h;setOn(tb.parentNode,tb);}
    run();
  }

  /* 注目の動画・投稿 */
  var picks=$("#picks");
  if(picks){
    picks.addEventListener("click",function(e){
      var b=e.target.closest("[data-yt]");if(!b)return;
      var f=document.createElement("iframe");
      f.src="https://www.youtube-nocookie.com/embed/"+b.dataset.yt+"?autoplay=1";
      f.allow="autoplay; encrypted-media; picture-in-picture";f.allowFullscreen=true;f.title="YouTube動画";
      b.replaceWith(f);
    });
    if($(".instagram-media",picks)){var s=document.createElement("script");s.async=true;s.src="https://www.instagram.com/embed.js";document.body.appendChild(s);}
  }

  /* タイプ診断 */
  var quiz=$("#quiz");
  if(quiz){
    var Q=JSON.parse($("#quizData").textContent),i=0,score={};
    var show=function(){
      if(i<Q.questions.length){
        var q=Q.questions[i];
        quiz.innerHTML='<div class="step">QUESTION '+(i+1)+' / '+Q.questions.length+'</div><div class="q">'+q.q+'</div><div class="opts">'+
          q.a.map(function(a,k){return '<button data-k="'+k+'">'+a[0]+'</button>'}).join("")+'</div>';
      }else{
        var best=Object.keys(score).sort(function(a,b){return score[b]-score[a]})[0],t=Q.types[best];
        quiz.innerHTML='<div class="result"><div class="step">YOUR TYPE</div><b>'+t.name+'</b><p>'+t.long+'</p>'+
          '<div class="acts"><a class="more" href="'+Q.creatorsUrl+'#'+best+'">'+t.name+'の発信者を見る</a><button id="again">もう一度</button></div></div>';
      }
    };
    quiz.addEventListener("click",function(e){
      if(e.target.id==="again"){i=0;score={};show();return;}
      var b=e.target.closest("[data-k]");if(!b)return;
      Q.questions[i].a[+b.dataset.k][1].forEach(function(t){score[t]=(score[t]||0)+1});
      i++;show();
    });
    show();
  }
})();
