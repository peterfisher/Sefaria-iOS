'use strict';

import PropTypes from 'prop-types';

import React, { useContext, useState, useEffect, cloneElement } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  View,
  Image,
  ActivityIndicator,
  ViewPropTypes,
  Animated,
  Platform,
} from 'react-native';
import { GlobalStateContext, DispatchContext, STATE_ACTIONS, themeStr, getTheme } from './StateManager';
import Sefaria from './sefaria';
import styles from './Styles.js';
import strings from './LocalizedStrings';

const InterfaceTextWithFallback = ({ en, he, extraStyles=[] }) => {
  const { interfaceLanguage } = useContext(GlobalStateContext);
  let langStyle = styles.enInt;
  let text = en;
  if ((interfaceLanguage === 'english' && !en) || (interfaceLanguage === 'hebrew' && !!he)) {
    langStyle = styles.heInt;
    text = he;
  }
  return (
    <Text style={[langStyle].concat(extraStyles)}>{text}</Text>
  );
}

const OrderedList = ({items, renderItem}) => {
  let arrayOffset = 0;
  return (
    <>
      {
        items.map((item, index) => {
          if (Array.isArray(item)) {
            arrayOffset += 1;
            return (
              <View style={{marginLeft: 10}} key={`wrapper|${index}`}>
                <OrderedList renderItem={renderItem} items={item}/>
              </View>
            );
          }
          return renderItem(item, index-arrayOffset);
        })
      }
    </>
  );
}

const SystemButton = ({ onPress, text, img, isHeb, isBlue, isLoading, extraStyles=[] }) => (
  <GlobalStateContext.Consumer>
    { ({ themeStr }) => (
      <TouchableOpacity disabled={isLoading} onPress={onPress} style={[styles.systemButton, getTheme(themeStr).mainTextPanel, styles.boxShadow, (isBlue ? styles.systemButtonBlue : null)].concat(extraStyles)}>
        { isLoading ?
          (<LoadingView size={'small'} height={20} color={isBlue ? '#ffffff' : undefined} />) :
          (<View style={styles.systemButtonInner}>
            { !!img ?
              <Image
                source={img}
                style={isHeb ? styles.menuButtonMarginedHe : styles.menuButtonMargined}
                resizeMode={'contain'}
              /> : null
            }
            <Text
              style={[
                styles.systemButtonText,
                getTheme(themeStr).text,
                (isBlue ? styles.systemButtonTextBlue : null),
                (isHeb ? styles.heInt : styles.enInt)
              ]}
            >
              { text }
            </Text>
          </View>)
        }
      </TouchableOpacity>
    )}
  </GlobalStateContext.Consumer>
);
SystemButton.whyDidYouRender = true;

const DynamicRepeatingText = ({ displayText, repeatText, maxCount }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const intervalId = setInterval(() => setCount(count => count + 1), 1000);
    return () => clearInterval(intervalId);
  }, []);
  return <Text>{`${displayText}${repeatText.repeat(Math.abs(count%(maxCount+1)))}`}</Text>
};

const SefariaProgressBar = ({ onPress, onClose, download, downloadNotification, identity, downloadSize }) => {
  /*
   * note on configuration: an object with keys {count, interval}. Count is the max number of times the progress bar
   * will update, interval is the minimum elapsed time (ms) between updates. Hardcoding now, but we can turn this into a
   * prop if needed.
   * Configuration is supported by rn-fetch-blob. As the progressBar is designed to listen to the state of an ongoing
   * process, I imagine this will generally be listening to libraries that support Stateful Promises. This can be
   * revisited if reuseability becomes a problem.
   */
  const config = {count: 20, interval: 250};
  const [ progress, setProgress ] = useState(0);
  const calculateProgress = (received, total) => !!(received) ? setProgress(received / total) : setProgress(0.0);
  const downloadActive = !!downloadNotification ? downloadNotification.downloadActive : false;
  const trueDownloadSize = !!(downloadSize) ? downloadSize : download.downloadSize;

  useEffect(() => {
    console.log('attaching Progress Tracker');
    download.attachProgressTracker(calculateProgress, config, identity);
    return function cleanup() {
      console.log('attaching dummy Progress Tracker');
      download.removeProgressTracker(identity);

    };
  }, [download]);  // we only want to resubscribe if the downloader object changes. This shouldn't happen, but the condition is here for completeness sake
  const downloadPercentage = Math.round(progress * 1000) / 10;
  return <GlobalStateContext.Consumer>
    {({themeStr, interfaceLanguage}) => (
      <TouchableOpacity onPress={!!onPress ? onPress : () => {
      }} disabled={!onPress} style={styles.sefariaProgressBar}>
        <View style={{flex: 1, flexDirection: interfaceLanguage === "hebrew" ? "row-reverse" : "row", height: 50, alignSelf: 'stretch'}}>
          <View style={{flex: progress, backgroundColor: "#fff"}}>
          </View>
          <View style={{flex: 1 - progress, backgroundColor: "#eee"}}>
          </View>
        </View>
        <View
          style={[{flexDirection: interfaceLanguage === "hebrew" ? "row-reverse" : "row"}, styles.sefariaProgressBarOverlay]}>
          <Text
            style={[{color: "#999"}, interfaceLanguage === "hebrew" ? styles.heInt : styles.enInt]}>{
              downloadActive ? `${strings.downloading} (${downloadPercentage}% ${strings.of} ${parseInt(trueDownloadSize/ 1e6)}mb)`
                :  <DynamicRepeatingText displayText={strings.connecting} repeatText={'.'} maxCount={3} />
          }</Text>
          {!!onClose ?
            <TouchableOpacity onPress={onClose}>
              <Image
                source={themeStr === 'white' ? require('./img/close.png') : require('./img/close-light.png')}
                resizeMode={'contain'}
                style={{width: 14, height: 14}}
              />
            </TouchableOpacity>
            : null
          }
        </View>
      </TouchableOpacity>
    )}
  </GlobalStateContext.Consumer>
};

const ConditionalProgressWrapper = ({ conditionMethod, initialValue, downloader, listenerName, children, ...otherProps }) => {
  const enclosedCondition = state => {
    return conditionMethod(state, otherProps)
  };
  const [downloadState, setDownload] = useState(initialValue);
  useEffect(() => {
    downloader.subscribe(listenerName, setDownload);
    return function cleanup() {
      downloader.unsubscribe(listenerName);
    }
  }, []);
  if(enclosedCondition(downloadState)) {
    return React.cloneElement(children, {downloadNotification: downloadState})
  } else { return null }
};

class TwoBox extends React.Component {
  static propTypes = {
    language: PropTypes.oneOf(["hebrew", "bilingual", "english"]),
  };

  render() {
      const rows = [];
      let currRow = [];
      const numChildren = React.Children.count(this.props.children);
      React.Children.forEach(this.props.children, (child, index) => {
        currRow.push(child);
        if (currRow.length === 2 || index === numChildren - 1) {
          rows.push(
            <TwoBoxRow key={index} language={this.props.language}>
              { currRow }
            </TwoBoxRow>
          );
          currRow = [];
        }
      });
      return (<View style={styles.twoBox}>{rows}</View>);
  }
}

class TwoBoxRow extends React.PureComponent {
  static propTypes = {
    language: PropTypes.oneOf(["hebrew","bilingual", "english"]),
  };
  render() {
    const { children, language } = this.props;
    const rowStyle = language == "hebrew" ? [styles.twoBoxRow, styles.rtlRow] : [styles.twoBoxRow];
    const numChildren = React.Children.count(children);
    const newChildren = React.Children.map(children, (child, index) => (
      <View style={styles.twoBoxItem} key={index}>{child}</View>
    ));
    if (numChildren < 2) {
      newChildren.push(<View style={styles.twoBoxItem} key={1}></View>);
    }
    return (
      <View style={rowStyle}>
        { newChildren }
      </View>
    );
  }
}

const CategoryBlockLink = ({
  category,
  heCat,
  style,
  icon,
  iconSide,
  subtext,
  upperCase,
  withArrow,
  isSans,
  onPress,
  onLongPress,
}) => {
  const { themeStr, textLanguage, interfaceLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  const isHeb = Sefaria.util.get_menu_language(interfaceLanguage, textLanguage) == 'hebrew';
  const iconOnLeft = iconSide ? iconSide === "start" ^ isHeb : isHeb;
  style  = style || {"borderColor": Sefaria.palette.categoryColor(category)};
  var enText = upperCase ? category.toUpperCase() : category;
  var heText = heCat || Sefaria.hebrewCategory(category);
  subtext = !!subtext && !(subtext instanceof Array) ? [subtext] : subtext;
  var textStyle  = [styles.centerText, theme.text, upperCase ? styles.spacedText : null];
  var content = isHeb ?
    (<Text style={[isSans ? styles.heInt : styles.hebrewText].concat(textStyle)}>{heText}</Text>) :
    (<Text style={[isSans ? styles.enInt : styles.englishText].concat(textStyle)}>{enText}</Text>);
  return (
    <TouchableOpacity onLongPress={onLongPress} onPress={onPress} style={[styles.readerNavCategory, theme.readerNavCategory, style]}>
      <View style={styles.readerNavCategoryInner}>
        { iconOnLeft && (withArrow || icon) ? <Image source={withArrow || !icon ? (themeStr == "white" ? require('./img/back.png') : require('./img/back-light.png')) : icon }
          style={[styles.moreArrowHe, isSans ? styles.categoryBlockLinkIconSansHe : null]}
          resizeMode={'contain'} /> : null }
        {content}
        { !iconOnLeft && (withArrow || icon) ? <Image source={ withArrow || !icon ? (themeStr == "white" ? require('./img/forward.png'): require('./img/forward-light.png')) : icon }
          style={[styles.moreArrowEn, isSans ? styles.categoryBlockLinkIconSansEn : null]}
          resizeMode={'contain'} /> : null }
      </View>
      {
        !!subtext ?
          <View style={styles.readerNavCategorySubtext}>
            { subtext.map(x => (
              <Text
                key={x.en}
                style={[isHeb ? styles.hebrewText : styles.englishText, {textAlign: "center"}, theme.secondaryText]}
              >
                {isHeb ? x.he : x.en}
              </Text>
            )) }
          </View>
        : null
      }
    </TouchableOpacity>
  );
}
CategoryBlockLink.propTypes = {
  category:  PropTypes.string,
  heCat:     PropTypes.string,
  language:  PropTypes.string,
  style:     PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  isSans:    PropTypes.bool,
  upperCase: PropTypes.bool,
  withArrow: PropTypes.bool,
  subtext:   PropTypes.oneOfType([PropTypes.shape({en: PropTypes.string, he: PropTypes.string}), PropTypes.arrayOf(PropTypes.shape({en: PropTypes.string, he: PropTypes.string}))]),
  onPress:   PropTypes.func,
  icon:      PropTypes.number,
  iconSide:  PropTypes.oneOf(["start", "end"])
};
CategoryBlockLink.whyDidYouRender = true;

const CategorySideColorLink = ({ language, category, enText, heText, sheetOwner, onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  const isHeb = language === 'hebrew';
  const borderSide = isHeb ? "Right" : "Left";
  const text = isHeb ? (heText || Sefaria.hebrewCategory(category)) : enText;
  return (
    <TouchableHighlight underlayColor={themeStr} style={{flex:1}} onPress={onPress}>
      <View style={{flex:1, flexDirection: isHeb ? "row-reverse" : "row"}}>
        <View style={{width: 6, [`border${borderSide}Color`]: Sefaria.palette.categoryColor(category), [`border${borderSide}Width`]: 6,}} />
        <View style={[styles.categorySideColorLink, theme.menu, theme.borderedBottom]}>
          <Text numberOfLines={1} ellipsizeMode={"middle"} style={[isHeb ? styles.hebrewText : styles.englishText, theme.text]}>
            {text}
            <Text style={isHeb ? {fontWeight: 'bold'} : {fontStyle: 'italic'}}>
              {sheetOwner}
            </Text>
          </Text>
        </View>
      </View>
    </TouchableHighlight>
  );
}
CategorySideColorLink.propTypes = {
  language:   PropTypes.string.isRequired,
  category:   PropTypes.string.isRequired,
  enText:     PropTypes.string.isRequired,
  heText:     PropTypes.string,
  onPress:    PropTypes.func.isRequired,
};

class AnimatedRow extends React.Component {
  static propTypes = {
    children: PropTypes.any.isRequired,
    animationDuration: PropTypes.number.isRequired,
    onRemove: PropTypes.func,
  }

  constructor(props) {
    super(props);
    this._position = new Animated.Value(1);
    this._height = new Animated.Value(1);
  }

  remove = () => {
    const { onRemove, animationDuration } = this.props;
    if (onRemove) {
      Animated.sequence([
        Animated.timing(this._position, {
          toValue: 0,
          duration: animationDuration,
          useNativeDriver: false,
        }),
        Animated.timing(this._height, {
          toValue: 0,
          duration: animationDuration,
          useNativeDriver: false,
        })
      ]).start(onRemove);
    }
  }

  render() {
    const rowStyles = [
      {
        height: this._height.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 50],
          extrapolate: 'clamp',
        }),
        left: this._position.interpolate({
          inputRange: [0, 1],
          outputRange: [-200, 0],
          extrapolate: 'clamp',
        }),
        opacity: this._position,
      },
    ];

    return (
      <Animated.View style={rowStyles}>
        {this.props.children}
      </Animated.View>
    )
  }
}

class CategoryColorLine extends React.Component {
  render() {
    var style = {backgroundColor: Sefaria.palette.categoryColor(this.props.category)};
    return (<View style={[styles.categoryColorLine, style]}></View>);
  }
}

const CategoryAttribution = ({ categories, context, linked=true, openUri }) => {
  const { themeStr, textLanguage, interfaceLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  // language settings in TextColumn should be governed by textLanguage. Everything else should be governed by textLanguage
  if (!categories) { return null; }
  var attribution = Sefaria.categoryAttribution(categories);
  if (!attribution) { return null; }

  var openLink = () => {openUri(attribution.link)};
  var boxStyles = [styles.categoryAttribution, styles[context + "CategoryAttribution" ]];
  var content = Sefaria.util.get_menu_language(interfaceLanguage, textLanguage) == "hebrew" ?
              <Text style={[styles[context + "CategoryAttributionTextHe"], theme.tertiaryText]}>{attribution.hebrew}</Text> :
              <Text style={[styles[context + "CategoryAttributionTextEn"], theme.tertiaryText]}>{attribution.english}</Text>;

  return linked ?
    (<TouchableOpacity style={boxStyles} onPress={openLink}>
      {content}
    </TouchableOpacity>) :
    (<View style={boxStyles}>
      {content}
    </View>);
}
CategoryAttribution.propTypes = {
  categories: PropTypes.array,
  context:    PropTypes.string.isRequired,
  linked:     PropTypes.bool,
  openUri:    PropTypes.func,
};

const LibraryNavButton = ({
  catColor,
  onPress,
  onPressCheckBox,
  checkBoxSelected,
  enText,
  heText,
  count,
  hasEn,
  withArrow,
  buttonStyle,
}) => {
  const { themeStr, textLanguage, interfaceLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  let colorStyle = catColor ? [{"borderColor": catColor}] : [theme.searchResultSummary, {"borderTopWidth": 1}];
  let textStyle  = [catColor ? styles.spacedText : null];
  const isHeb = Sefaria.util.get_menu_language(interfaceLanguage, textLanguage) == "hebrew";
  let flexDir = isHeb ? "row-reverse" : "row";
  let textMargin = !!onPressCheckBox ? { marginHorizontal: 0 } : styles.readerSideMargin;
  if (count === 0) { textStyle.push(theme.secondaryText); }
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.searchFilterCat, {flexDirection: flexDir}, buttonStyle].concat(colorStyle)}
      delayPressIn={200}
    >
      <View style={[{flexDirection: flexDir, alignItems: "center", justifyContent: "space-between", flex: 1}, textMargin]}>
        <View style={{flexDirection: flexDir, alignItems: "center"}}>
          {
            !!onPressCheckBox ?
            <TouchableOpacity style={{paddingHorizontal: 10, paddingVertical: 15}} onPress={onPressCheckBox} >
              <IndeterminateCheckBox themeStr={themeStr} state={checkBoxSelected} onPress={onPressCheckBox} />
            </TouchableOpacity> : null
          }
          { !isHeb ?
            <Text style={[styles.englishText].concat([theme.tertiaryText, textStyle, {paddingTop:3}])}>
              {`${enText} `}
              {
                !!count ? <Text style={[styles.englishText].concat([theme.secondaryText, textStyle])}>{`(${count})`}</Text> : null
              }
            </Text>
            :
            <Text style={[styles.hebrewText].concat([theme.tertiaryText, textStyle, {paddingTop:13}])}>
              {`${heText} `}
              {
                !!count ? <Text style={[styles.hebrewText].concat([theme.secondaryText, textStyle])}>{`(${count})`}</Text> : null
              }
            </Text>
          }
        </View>
        {
          (hasEn && !isHeb) ? <Text style={[styles.englishSystemFont, styles.enConnectionMarker, theme.enConnectionMarker, theme.secondaryText, Platform.OS === 'android' ? {paddingLeft: 5, paddingTop: 2} : null]}>{"EN"}</Text> : null
        }
      </View>
      { withArrow ?
        <DirectedArrow themeStr={themeStr} imageStyle={{opacity: 0.5}} language={textLanguage} direction={"forward"} />
        : null
      }
   </TouchableOpacity>
 );
}
LibraryNavButton.propTypes = {
  catColor:        PropTypes.string,
  onPress:         PropTypes.func.isRequired,
  onPressCheckBox: PropTypes.func,
  checkBoxSelected:PropTypes.number,
  enText:          PropTypes.string.isRequired,
  heText:          PropTypes.string.isRequired,
  count:           PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  withArrow:       PropTypes.bool.isRequired,
  buttonStyle:     PropTypes.oneOfType([ViewPropTypes.style, PropTypes.array]),
};

const LanguageToggleButton = () => {
  // button for toggling b/w he and en for menu and text lang (both controlled by `textLanguage`)
  const { themeStr, interfaceLanguage, textLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  const dispatch = useContext(DispatchContext);
  const isHeb = Sefaria.util.get_menu_language(interfaceLanguage, textLanguage) == 'hebrew';

  const toggle = () => {
    const language = !isHeb ? "hebrew" : 'english';
    dispatch({
      type: STATE_ACTIONS.setTextLanguage,
      value: language,
    });
  };

  const content = isHeb ?
      (<Text style={[styles.languageToggleTextEn, theme.languageToggleText, styles.en]}>A</Text>) :
      (<Text style={[styles.languageToggleTextHe, theme.languageToggleText, styles.he]}>א</Text>);
  const style = [styles.languageToggle, theme.languageToggle, interfaceLanguage === "hebrew" ? {opacity:0} : null];
  return (
    <TouchableOpacity style={style} onPress={interfaceLanguage === "hebrew" ? null : toggle}>
      {content}
    </TouchableOpacity>
  );
}

const CollapseIcon = ({ showHebrew, isVisible }) => {
  const { themeStr } = useContext(GlobalStateContext);
  var src;
  if (themeStr == "white") {
    if (isVisible) {
      src = require('./img/down.png');
    } else {
      if (showHebrew) {
        src = require('./img/back.png');
      } else {
        src = require('./img/forward.png');
      }
    }
  } else {
    if (isVisible) {
      src = require('./img/down-light.png');
    } else {
      if (showHebrew) {
        src = require('./img/back-light.png');
      } else {
        src = require('./img/forward-light.png');
      }
    }
  }
  return (
    <Image
      source={src}
      style={(showHebrew ? styles.collapseArrowHe : styles.collapseArrowEn)}
      resizeMode={'contain'}
    />
  );
}
CollapseIcon.propTypes = {
  showHebrew:  PropTypes.bool,
  isVisible: PropTypes.bool
};

class DirectedButton extends React.Component {
  //simple button with onPress() and a forward/back arrow. NOTE: arrow should change direction depending on interfaceLang
  static propTypes = {
    text:       PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    language:   PropTypes.oneOf(["hebrew", "english"]).isRequired,
    textStyle:  PropTypes.oneOfType([Text.propTypes.style, PropTypes.array]),
    imageStyle: PropTypes.oneOfType([ViewPropTypes.style, PropTypes.array]),
    onPress:    PropTypes.func.isRequired,
    direction:  PropTypes.oneOf(["forward", "back"]).isRequired
  };

  render() {
    //the actual dir the arrow will face
    var actualDirBack = (this.props.language === "hebrew"  && this.props.direction === "forward") || (this.props.language === "english" && this.props.direction === "back")
    return (
      <TouchableOpacity onPress={this.props.onPress}
        style={{ flexDirection: actualDirBack ? "row-reverse" : "row", alignItems: "center" }}
        hitSlop={{top: 20, bottom: 20, left: 10, right: 10}}>
        { this.props.text ?
          <SText lang={this.props.language} style={this.props.textStyle}>
            {this.props.text}
          </SText> :
          null
        }
        <DirectedArrow
          imageStyle={this.props.imageStyle}
          language={this.props.language}
          direction={this.props.direction} />
      </TouchableOpacity>
    );
  }
}

const DirectedArrow = ({ imageStyle, language, direction }) => {
  const { themeStr } = useContext(GlobalStateContext);
  const isheb = language === 'hebrew';
  var actualDirBack = (isheb  && direction === "forward") || (!isheb && direction === "back");
  //I wish there was a way to reduce these if statements, but there's a limitation that require statements can't have variables in them
  var src;
  if (actualDirBack) {
    if (themeStr === "white") {
      src = require("./img/back.png");
    } else {
      src = require("./img/back-light.png");
    }
  } else {
    if (themeStr === "white") {
      src = require("./img/forward.png");
    } else {
      src = require("./img/forward-light.png");
    }
  }
  return (
    <Image source={src} style={imageStyle} resizeMode={'contain'}/>
  );
}
DirectedArrow.propTypes = {
  imageStyle:   PropTypes.oneOfType([ViewPropTypes.style, PropTypes.array]),
  language:     PropTypes.oneOf(["hebrew", "bilingual", "english"]).isRequired,
  direction:  PropTypes.oneOf(["forward", "back"]).isRequired,
};

const SearchButton = ({ onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  return (
    <TouchableOpacity style={[styles.headerButton, styles.headerButtonSearch]} onPress={onPress}>
      <Image
        source={themeStr == "white" ? require('./img/search.png'): require('./img/search-light.png') }
        style={styles.searchButton}
        resizeMode={'contain'}
      />
    </TouchableOpacity>
  );
}

const MenuButton = ({ onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  return (
    <TouchableOpacity style={[styles.headerButton, styles.leftHeaderButton]} onPress={onPress}>
      <Image
        source={themeStr == "white" ? require('./img/menu.png'): require('./img/menu-light.png') }
        style={styles.menuButton}
        resizeMode={'contain'}
      />
    </TouchableOpacity>
  );
}

const CloseButton = ({ onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  return (
    <TouchableOpacity style={[styles.headerButton, styles.leftHeaderButton]} onPress={onPress}>
      <Image
        source={themeStr == "white" ? require('./img/close.png'): require('./img/close-light.png') }
        style={styles.closeButton}
        resizeMode={'contain'}
      />
    </TouchableOpacity>
  );
}

const CircleCloseButton = ({ onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  return (
    <TouchableOpacity style={styles.headerButton} onPress={onPress}>
      <Image
        source={themeStr == "white" ? require('./img/circle-close.png'): require('./img/circle-close-light.png') }
        style={styles.circleCloseButton}
        resizeMode={'contain'}
      />
    </TouchableOpacity>
  );
}

const TripleDots = ({ onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  return (
    <TouchableOpacity
      style={styles.tripleDotsContainer}
      onPress={onPress}
    >
      <Image
        style={styles.tripleDots}
        source={themeStr == "white" ? require('./img/dots.png'): require('./img/dots-light.png') }
      />
    </TouchableOpacity>
  );
}

const DisplaySettingsButton = ({ onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  return (
    <TouchableOpacity
      style={[styles.headerButton, styles.rightHeaderButton]}
      onPress={onPress}
    >
      <Image
        source={themeStr == "white" ? require('./img/a-aleph.png'): require('./img/a-aleph-light.png') }
        style={styles.displaySettingsButton}
        resizeMode={'contain'}
      />
    </TouchableOpacity>
  );
}

const ToggleSet = ({ options, active }) => {
  const { themeStr, textLanguage, interfaceLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  const isHeb = Sefaria.util.get_menu_language(interfaceLanguage, textLanguage) == 'hebrew';
  options = options.map((option, i) => {
    var style = [styles.navToggle, theme.navToggle].concat(active === option.name ? [styles.navToggleActive, theme.navToggleActive] : []);
    return (
      <TouchableOpacity onPress={option.onPress} key={i} >
        {isHeb ?
          <Text style={[style, styles.heInt]}>{option.heText}</Text> :
          <Text style={[style, styles.enInt]}>{option.text}</Text> }
      </TouchableOpacity>
    );
  });

  var dividedOptions = [];
  for (var i = 0; i < options.length; i++) {
    dividedOptions.push(options[i])
    dividedOptions.push(<Text style={[styles.navTogglesDivider,theme.navTogglesDivider]} key={i+"d"}>|</Text>);
  }
  dividedOptions = dividedOptions.slice(0,-1);

  return (
    <View style={styles.navToggles}>
      {dividedOptions}
    </View>
  );
}
ToggleSet.propTypes = {
  options:     PropTypes.array.isRequired, // array of object with `name`. `text`, `heText`, `onPress`
  active:      PropTypes.string.isRequired
};

const ButtonToggleSet = ({ options, active }) => {
  const { themeStr, interfaceLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  var showHebrew = interfaceLanguage == "hebrew";
  const optionComponents = options.map((option, i) => {

    let alignStyle;
    if (i == options.length -1) { alignStyle = styles.readerDisplayOptionsMenuItemRight; }
    else if (i == 0)            { alignStyle = styles.readerDisplayOptionsMenuItemLeft; }
    else                        { alignStyle = styles.readerDisplayOptionsMenuItemCenter; }

    var itemStyles = [styles.readerDisplayOptionsMenuItem, theme.readerDisplayOptionsMenuItem, alignStyle];
    itemStyles = itemStyles.concat(active === option.name ? [theme.readerDisplayOptionsMenuItemSelected] : []);
    return (
      <TouchableOpacity onPress={option.onPress} key={i} style={itemStyles}>
        {showHebrew ?
          <Text style={[styles.heInt, theme.tertiaryText]}>{option.text}</Text> :
          <Text style={[styles.enInt, theme.tertiaryText]}>{option.text}</Text> }
      </TouchableOpacity>
    );
  });

  return (
    <View style={[styles.readerDisplayOptionsMenuRow, styles.buttonToggleSet]}>
      {optionComponents}
    </View>
  );
}
ButtonToggleSet.propTypes = {
  options:     PropTypes.array.isRequired, // array of object with `name`. `text`, `onPress`
  active:      PropTypes.oneOfType([PropTypes.bool, PropTypes.string])
};

const ButtonToggleSetNew = ({ options, active }) => {
  /* based on new styles guide */
  const { themeStr, interfaceLanguage } = useContext(GlobalStateContext);
  const theme = getTheme(themeStr);
  const isHeb = interfaceLanguage === 'hebrew';
  return (
    <View style={[styles.readerDisplayOptionsMenuRow, styles.boxShadow, styles.buttonToggleSetNew, theme.mainTextPanel]}>
      {
        options.map(option => (
          <TouchableOpacity key={option.name} onPress={option.onPress} style={[styles.buttonToggle, active === option.name ? styles.buttonToggleActive : null]}>
            <Text  style={[theme.text, active === option.name ? styles.buttonToggleActiveText : null, isHeb? styles.heInt : styles.enInt]}>{ option.text }</Text>
          </TouchableOpacity>
        ))
      }
    </View>
  );
}

const LoadingView = ({ style, category, size, height, color=Sefaria.palette.colors.system }) => (
  <View style={[styles.loadingViewBox, style]}>
    <ActivityIndicator
      animating={true}
      style={[styles.loadingView, !!height ? { height } : null]}
      color={Platform.OS === 'android' ? (category ? Sefaria.palette.categoryColor(category) : color) : undefined}
      size={size || 'large'}
    />
  </View>
);

const IndeterminateCheckBox = ({ state, onPress }) => {
  const { themeStr } = useContext(GlobalStateContext);
  var src;
  if (state === 1) {
    if (themeStr == "white") {
      src = require('./img/checkbox-checked.png');
    } else {
      src = require('./img/checkbox-checked-light.png');
    }
  } else if (state === 0) {
    if (themeStr == "white") {
      src = require('./img/checkbox-unchecked.png');
    } else {
      src = require('./img/checkbox-unchecked-light.png');
    }
  } else {
    if (themeStr == "white") {
      src = require('./img/checkbox-partially.png');
    } else {
      src = require('./img/checkbox-partially-light.png');
    }
  }

  return (
    <TouchableOpacity onPress={onPress}>
      <Image source={src}
        resizeMode={'contain'}
        style={styles.searchFilterCheckBox} />
    </TouchableOpacity>
  );
}
IndeterminateCheckBox.propTypes = {
  state:      PropTypes.oneOf([0,1,2]),
  onPress:    PropTypes.func.isRequired,
};

class RainbowBar extends React.Component {
  render() {
    const colors = [
      "darkteal",
      "lightblue",
      "yellow",
      "green",
      "red",
      "purple",
      "darkpink",
      "lavender",
      "teal",
      "darkblue",
    ]
    const bars = colors.map(color=>(
        <View style={{backgroundColor: Sefaria.palette.colors[color], height: 8, flexGrow: 1}} key={color}/>)
    );
    return (
      <View style={styles.rainbowBar} >
        {bars}
      </View>
    )
  }
}

const HebrewInEnglishText = ({ text, stylesEn, stylesHe }) => (
  Sefaria.util.hebrewInEnglish(Sefaria.util.stripHtml(text),"list").map((chunk, index) =>
    (Sefaria.hebrew.isHebrew(chunk) ?
      <Text key={index} style={stylesHe}>{chunk}</Text> :
      <Text key={index} style={stylesEn}>{chunk}</Text>
    )
  )
);

class SText extends React.Component {
  static propTypes = {
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.object, PropTypes.array]),
    lang:     PropTypes.oneOf(["hebrew", "bilingual", "english"]),
    style:    PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  }

  // very naive guess at what the function should be
  fsize2lheight = (fsize, lang, lineMultiplier) => (
    (lineMultiplier || 1) * (Platform.OS === 'ios' ?
    (lang !== "hebrew" ? (fsize * 1.2) : fsize) :
    (lang !== "hebrew" ? (fsize * 1.333) : fsize))
  );

  getFontSize = (style, lang) => {
    let fsize = 14;  // default font size in rn (i believe)
    for (let s of style) {
      if (!!s && !!s.fontSize) { fsize = s.fontSize; }
    }
    fsize = lang === "hebrew" ? 1.2*fsize : fsize;
    return fsize;
  }

  render() {
    const { style, lang, lineMultiplier, children } = this.props;
    const styleArray = Array.isArray(style) ? style : [style];
    const fontSize = this.getFontSize(styleArray, lang);
    return (
      <Text {...this.props} style={styleArray.concat([{lineHeight: this.fsize2lheight(fontSize, lang, lineMultiplier)}])}>
        { children }
      </Text>
    );
  }
}

export {
  AnimatedRow,
  ButtonToggleSet,
  ButtonToggleSetNew,
  CategoryBlockLink,
  CategoryAttribution,
  CategoryColorLine,
  CategorySideColorLink,
  CircleCloseButton,
  CloseButton,
  CollapseIcon,
  ConditionalProgressWrapper,
  DirectedArrow,
  DirectedButton,
  DisplaySettingsButton,
  HebrewInEnglishText,
  IndeterminateCheckBox,
  InterfaceTextWithFallback,
  LanguageToggleButton,
  LibraryNavButton,
  LoadingView,
  MenuButton,
  OrderedList,
  RainbowBar,
  SearchButton,
  SefariaProgressBar,
  SText,
  SystemButton,
  ToggleSet,
  TripleDots,
  TwoBox,
  TwoBoxRow,
}
