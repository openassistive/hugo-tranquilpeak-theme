(function($) {
  'use strict';

  var sourceforgePatt = new RegExp("^https?:\/\/?(?:www\.)?(sourceforge)\.net\/(projects)(\/)?([a-zA-Z0-9-]*)\/?$"),
      thingiversePatt = new RegExp("^https?:\/\/?(?:www\.)?(thingiverse)\.com\/(thing)(:)?([0-9]*)\/?$"),
      pinshapePatt = new RegExp("^https?:\/\/?(?:www\.)?(pinshape)\.com\/(items)(\/)?([a-zA-Z0-9-]*)\/?$"),
      instructablesPatt = new RegExp("^https?:\/\/?(?:www\.)?(instructables)\.com\/(id)(\/)?([a-zA-Z0-9-]*)\/?$"),
      githubPatt = new RegExp("^https?:\/\/?(?:www\.)?(github)\.com\/?([a-zA-Z0-9\-_\.]*)(\/)?([a-zA-Z0-9\-_\.]*)\/?$"),
      projectOrigins = ['sourceforge','thingiverse','pinshape',
                        'instructables','github'];
  function parseProjectUrl(url) {
    function commonConv(m){return [m[1],m[4]]}
    var checklist = [
      { r: sourceforgePatt, conv:commonConv },
      { r: thingiversePatt, conv:commonConv },
      { r: pinshapePatt, conv:commonConv },
      { r: instructablesPatt, conv:commonConv },
      { r: githubPatt, conv:function(m){return [m[1],m.slice(2,5).join("")]} }
    ];
    for(var i = 0, len = checklist.length; i < len; ++i) {
      var item = checklist[i];
      var match = item.r.exec(url);
      if(match != null) {
        return item.conv(match);
      }
    }
    return null;
  }
  function ajaxFailMessage($xhr) {
    var data;
    try {
      data = JSON.parse($xhr.responseText);
    } catch(e) { }
    return data ? ('<strong>Error</strong> ' + data.error) :
        ('<strong>' + $xhr.status + '</strong>: ' +
         $xhr.statusText);
  }
  function parseQueries() {
    function _parse(s) {
      var ret = {},
          sa = s.split('&');
      for(var i = 0, len = sa.length; i < len; ++i) {
        var v = sa[i].split('=');
        ret[decodeURIComponent(v[0])] =
          decodeURIComponent(v.length > 1 ? v[1] : "");
      }
      return ret;
    }
    var q = window.location.search;
    return _parse(q.length > 0 ? (q[0] == '?' ? q.substr(1) : q) : '');
  }
  // add parsley project url validator
  window.Parsley.addValidator('projectUrl', {
    validateString: function(url) {
      return !url || parseProjectUrl(url) != null;
    },
    messages: {
      en: 'Unkown url has given, Known hosts are ('+projectOrigins.join(', ')+')'
    }
  });
  function _addSelectInit() {
    var $form = $('#add-project-select-form'),
        $wrp = $form.parents('.add-wrapper'),
        parsley = $form.parsley();
    $form.submit(function($evt) {
      $evt.preventDefault();
      // [for now] check for validity of url
      $form.find('.error-msg').hide();
      if(!parsley.validate()) {
        return;
      }
      var $btn = $form.find('button[type=submit]');
      $btn.prop('disabled', true);
      var url = $form.find('input[name=url]').val();
      var m = parseProjectUrl(url);
      if(!m)
        return; // should not happen
      // GET request
      $.ajax({
        url: "http://api.openassistive.org/v1/service/"+
             encodeURIComponent(m[0])+"/project?id="+encodeURIComponent(m[1]),
        dataType: 'json'
      })
        .then(function(data) {
          // goto submit page
          window.location = $form.attr('action') + '?' + $.param({
            service: m[0],
            id: m[1]
          });
        })
        .fail(function($xhr) {
          $form.find('.error-msg').html(ajaxFailMessage($xhr)).show();
        })
        .always(function(){ $btn.prop('disabled', false); });
    });
  }
  function _addSubmitInit() {
    var $form = $('#add-project-submit-form'),
        $wrp = $form.parents('.add-wrapper');
    $form.find('.multiselect2').select2(); // should get called before parsley
    // replace selects to display errors at bottom
    $form.find('.multiselect2')
      .each(function(){ $(this).parent().append(this); });
    var $tags = $("#tags-select2"),
        parsley = $form.parsley(), // initiate parsley
        // load data
        query = parseQueries(),
        service = query.service,
        id = query.id,
        data;
    function loadingFinished(success, msg) {
      $wrp.find('.state-after-loading').addClass('ready');
      $wrp.find('.state-loading').addClass('finished');
      if(!success) {
        $form.find('.error-msg').html(msg).show();
        $form.find('button[type=submit]').prop('disabled', true);
      }
    }
    function updateForm() {
      for(var key in data) {
        var $inp = $form.find('input,textarea,select')
            .filter('[name="'+key+'"]');
        if($inp.length > 0)
          $inp.val(data[key] || '');
      }
    }
    function dataWithFormInput() {
      var d = $.extend({}, data);
      $form.find('input,textarea,select')
        .each(function() {
          var $inp = $(this);
          if($inp.prop('name'))
            d[$inp.prop] = $inp.value;
        });
      d.tags = $tags.val();
      return d;
    }
    if(!service || !id) {
      loadingFinished(false, "service and id parameters are required!");
      return;
    }
    $.ajax({
      url: "http://api.openassistive.org/v1/service/"+
        encodeURIComponent(service)+"/project?id="+encodeURIComponent(id),
      dataType: 'json'
    })
      .then(function(_data) {
        loadingFinished(true);
        data = _data;
        updateForm()
      })
      .fail(function($xhr) {
        loadingFinished(false, ajaxFailMessage($xhr));
      });
    $form.submit(function($evt) {
      $evt.preventDefault();
      $form.find('.error-msg').hide();
      if(!parsley.validate()) {
        return;
      }
      var $btn = $form.find('button[type=submit]');
      $btn.prop('disabled', true);
      $.ajax({
        type: "POST",
        url: "http://api.openassistive.org/v1/project/save",
        data: JSON.stringify(dataWithFormInput()),
        contentType: "application/json; charset=utf-8",
        dataType: "json"
      })
        .then(function(data) {
          // thank you page
          window.location = $form.data('done-goto');
        })
        .fail(function($xhr) {
          $form.find('.error-msg').html(ajaxFailMessage($xhr)).show();
        })
        .always(function(){ $btn.prop('disabled', false); });
    });
    $form.find('.back-btn').click(function(){
      window.location = $(this).data('goto');
    });
  }
  $(function() {
    if($('#add-project-select-form').length > 0)
      _addSelectInit()
    if($('#add-project-submit-form').length > 0)
      _addSubmitInit();
  });

  
  // Fade out the blog and let drop the add card of the author and vice versa

  /**
   * AddCard
   * @constructor
   */
  var AddCard = function() {
    this.$openBtn = $("#sidebar, #header").find("a[href*='#add']");
    this.$closeBtn = $('#add-btn-close');
    this.$blog = $('#blog');
    this.$add = $('#add');
    this.$addCard = $('#add-card');
  };

  AddCard.prototype = {

    /**
     * Run AddCard feature
     * @return {void}
     */
    run: function() {
      var self = this;
      // Detect click on open button
      self.$openBtn.click(function(e) {
        e.preventDefault();
        self.play();
      });
      // Detect click on close button
      self.$closeBtn.click(function(e) {
        e.preventDefault();
        self.playBack();
      });
    },

    /**
     * Play the animation
     * @return {void}
     */
    play: function() {
      var self = this;
      // Fade out the blog
      self.$blog.fadeOut();
      // Fade in the add card
      self.$add.fadeIn();
      // Small timeout to drop the add card after that
      // the add card fade in and the blog fade out
      setTimeout(function() {
        self.dropAddCard();
      }, 300);
    },

    /**
     * Play back the animation
     * @return {void}
     */
    playBack: function() {
      var self = this;
      // Lift the add card
      self.liftAddCard();
      // Fade in the blog after that the add card lifted up
      setTimeout(function() {
        self.$blog.fadeIn();
      }, 500);
      // Fade out the add card after that the add card lifted up
      setTimeout(function() {
        self.$add.fadeOut();
      }, 500);
    },

    /**
     * Slide the card to the middle
     * @return {void}
     */
    dropAddCard: function() {
      var self = this;
      var addCardHeight = self.$addCard.innerHeight();
      // default offset from top
      var offsetTop = ($(window).height() / 2) - (addCardHeight / 2) + addCardHeight;
      // if card is longer than the window
      // scroll is enable
      // and re-define offsetTop
      if (addCardHeight + 30 > $(window).height()) {
        offsetTop = addCardHeight;
      }
      self.$addCard
        .css('top', '0px')
        .css('top', '-' + addCardHeight + 'px')
        .show(500, function() {
          self.$addCard.animate({
            top: '+=' + offsetTop + 'px'
          });
        });
    },

    /**
     * Slide the card to the top
     * @return {void}
     */
    liftAddCard: function() {
      var self = this;
      var addCardHeight = self.$addCard.innerHeight();
      // default offset from top
      var offsetTop = ($(window).height() / 2) - (addCardHeight / 2) + addCardHeight;
      if (addCardHeight + 30 > $(window).height()) {
        offsetTop = addCardHeight;
      }
      self.$addCard.animate({
        top: '-=' + offsetTop + 'px'
      }, 500, function() {
        self.$addCard.hide();
        self.$addCard.removeAttr('style');
        // reset form
        resetAddForm();
      });
    }
  };

  $(document).ready(function() {
    var addCard = new AddCard();
    addCard.run();
  });
})(jQuery);
