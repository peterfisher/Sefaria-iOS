'use strict';

import PropTypes from 'prop-types';

import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  FlatList,
  Image,

} from 'react-native';

import {
  CategoryColorLine,
  TwoBox,
  LanguageToggleButton,
  MenuButton,
  LoadingView
} from './Misc.js';

import styles from './Styles.js';
import strings from "./LocalizedStrings";
import {DirectedButton} from "./Misc";
import SheetResult from "./SheetResult";


class ReaderNavigationSheetCategoryMenu extends React.Component {
  static propTypes = {
    theme:          PropTypes.object.isRequired,
    themeStr:       PropTypes.string.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      tagCategories: [],

    };
  }

  getData() {

    if (this.props.category=="All Tags") {
        Sefaria.api.allTags("alpha", true)
          .then(results => {
              console.log('loaded eng tags')
              this.setState({tagCategories: results.filter(tag => tag.count > 5)}, () => console.log('sorted en tags'));
            })
          .catch(error => {
            console.log(error)
          })
    }

    else if (this.props.category=="כל התוויות") {
        Sefaria.api.allTags("alpha-hebrew", true)
          .then(results => {
              console.log('loaded he tags')
              this.setState({tagCategories: results.filter(tag => tag.count > 5)}, () => console.log('sorted he tags'));
            }

        )
          .catch(error => {
            console.log(error)
        })
    }

    else {


        Sefaria.api.tagCategory(this.props.category)
          .then(results => {
              this.setState({tagCategories: results}, () => console.log(results));
            })
          .catch(error => {
            console.log(error)
          })
    }

  }
  componentDidMount() {
    this.getData();
   }

  _keyExtractor = (sheet, pos) => {
    return sheet.id + "|" + pos;
  };


  renderItem = ({ item, index }) => {
      var showHebrew = this.props.interfaceLanguage == "hebrew";
      return (
          <View style={[styles.twoBoxItem,
                        {"flex": this.state.tagCategories.length%2!= 0 && index == this.state.tagCategories.length-1 ? .5 : 1 }
          ]} key={index}>
              <TouchableOpacity style={[styles.textBlockLink, this.props.theme.textBlockLink]}
                                onPress={() => this.props.openSheetTagMenu(item.tag)}>
                  {showHebrew ?
                      <Text
                          style={[styles.hebrewText, styles.centerText, this.props.theme.text]}>{item.heTag}</Text> :
                      <Text
                          style={[styles.englishText, styles.centerText, this.props.theme.text]}>{item.tag}</Text>}
              </TouchableOpacity>
          </View>
      )
  }


    render() {
      var showHebrew = this.props.interfaceLanguage == "hebrew";

      if (this.state.tagCategories.length == 0) { return (<LoadingView />); }


      return(
            <View style={[styles.menu, this.props.theme.menu]}>
                <CategoryColorLine category="Sheets" />
              <View style={[styles.header, this.props.theme.header]}>
              <DirectedButton
                onPress={this.props.onBack}
                themeStr={this.props.themeStr}
                imageStyle={[styles.menuButton, styles.directedButton]}
                direction="back"
                language="english"/>
                {showHebrew ?
                  <Text style={[styles.he, styles.categoryTitle, this.props.theme.categoryTitle, {textTransform: "uppercase"}]}>{this.props.category}</Text> :
                  <Text style={[styles.en, styles.categoryTitle, this.props.theme.categoryTitle, {textTransform: "uppercase"}]}>{this.props.category}</Text> }
                <LanguageToggleButton />
              </View>


                <FlatList
                  style={styles.menuAllSheetTagContent}
                  data={this.state.tagCategories}
                  keyExtractor={(item, index) => item.id}
                  renderItem={this.renderItem}
                  numColumns={2}
                  ListHeaderComponent={
                    <View style={styles.category} key="AllSourceSheetTags">
                        { showHebrew ?
                        <Text style={[styles.heInt, styles.categorySectionTitle, this.props.theme.categorySectionTitle]}>חיפוש לפי נושא</Text> :
                        <Text style={[styles.enInt, styles.categorySectionTitle, this.props.theme.categorySectionTitle]}>Explore by Topic</Text> }
                    </View>
                  }
                />

            </View>
      )

    }
}





export default ReaderNavigationSheetCategoryMenu;
