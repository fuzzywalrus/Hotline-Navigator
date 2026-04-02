## Purpose

Defines the hierarchical news system with categories, bundles, articles, threading, and access-controlled posting and deletion.

## Requirements

### Requirement: News Category Hierarchy

The system SHALL support a hierarchical news structure consisting of categories and bundles.

Categories (type=3) act as containers that hold bundles or other categories. Bundles (type=2) act as containers that hold articles. Each category and bundle SHALL have a name, an item count, and a path within the hierarchy.

The NewsPath field SHALL be encoded similarly to the FilePath field, representing the path through the category hierarchy.

#### Scenario: Fetch news category list

- **WHEN** the client sends a GetNewsCategoryList transaction (TransactionType::GetNewsCategoryList) with an optional path
- **THEN** the server SHALL return a list of entries, each with a type (category=3 or bundle=2), name, and item count
- **THEN** entries SHALL be organized hierarchically reflecting the category tree at the requested path

#### Scenario: Fetch news category list at root

- **WHEN** the client sends a GetNewsCategoryList transaction with no path specified
- **THEN** the server SHALL return the top-level categories and bundles

#### Scenario: Fetch nested category contents

- **WHEN** the client sends a GetNewsCategoryList transaction with a path pointing to a category that contains sub-categories
- **THEN** the server SHALL return only the direct children of that category


### Requirement: News Article Listing

The system SHALL support listing articles within a news bundle.

#### Scenario: Fetch articles in a bundle

- **WHEN** the client sends a GetNewsArticleList transaction (TransactionType::GetNewsArticleList) with a valid bundle path
- **THEN** the server SHALL return a list of articles, each with an id, parent_id, flags, title, poster name, date, and path

#### Scenario: Root-level articles have zero parent_id

- **WHEN** articles are returned from GetNewsArticleList
- **THEN** articles that are not replies to other articles SHALL have a parent_id of 0

#### Scenario: Threaded articles reference their parent

- **WHEN** an article is a reply to another article
- **THEN** the article's parent_id SHALL reference the id of the article it replies to


### Requirement: News Article Content Retrieval

The system SHALL support retrieving the full text content of a news article.

#### Scenario: Fetch article text

- **WHEN** the client sends a GetNewsArticleData transaction (TransactionType::GetNewsArticleData) with an article id and bundle path
- **THEN** the server SHALL return the article content as a string

#### Scenario: Article text rendered as Markdown

- **WHEN** article content is displayed in the UI
- **THEN** the system SHALL render the article body using Markdown formatting


### Requirement: News Article Posting

The system SHALL support posting new articles and threaded replies.

#### Scenario: Post a new top-level article

- **WHEN** the client sends a PostNewsArticle transaction (TransactionType::PostNewsArticle) with a title, body, and bundle path, and no parent_id
- **THEN** the server SHALL create a new top-level article in the specified bundle

#### Scenario: Post a threaded reply

- **WHEN** the client sends a PostNewsArticle transaction with a title, body, bundle path, and a parent_id referencing an existing article
- **THEN** the server SHALL create a reply article threaded under the specified parent article


### Requirement: News Category and Bundle Management

The system SHALL support creating and deleting news categories and bundles.

#### Scenario: Create a news category

- **WHEN** the client sends a NewNewsCategory transaction (TransactionType::NewNewsCategory) with a name and parent path
- **THEN** the server SHALL create a new category at the specified location in the hierarchy

#### Scenario: Create a news bundle

- **WHEN** the client sends a NewNewsFolder transaction (TransactionType::NewNewsFolder) with a name and parent path
- **THEN** the server SHALL create a new bundle at the specified location in the hierarchy

#### Scenario: Delete a category or bundle

- **WHEN** the client sends a DeleteNewsItem transaction (TransactionType::DeleteNewsItem) with a valid path
- **THEN** the server SHALL remove the specified category or bundle from the hierarchy


### Requirement: News Article Deletion

The system SHALL support deleting individual articles and recursive deletion of threaded replies.

#### Scenario: Delete a single article

- **WHEN** the client sends a DeleteNewsArticle transaction (TransactionType::DeleteNewsArticle) with an article id, bundle path, and no recursive flag
- **THEN** the server SHALL delete only the specified article

#### Scenario: Delete an article and its replies recursively

- **WHEN** the client sends a DeleteNewsArticle transaction with an article id, bundle path, and the recursive deletion flag set
- **THEN** the server SHALL delete the specified article and all articles threaded beneath it


### Requirement: News Access Privileges

Access to news features SHALL be governed by the user's access privilege bits.

#### Scenario: User without read privilege cannot fetch news

- **WHEN** a user whose Can Read News privilege (bit 20) is not set attempts to fetch categories, articles, or article content
- **THEN** the server SHALL deny the request

#### Scenario: User without post privilege cannot post articles

- **WHEN** a user whose Can Post News privilege (bit 21) is not set attempts to post an article
- **THEN** the server SHALL deny the request

#### Scenario: User without delete privilege cannot delete articles

- **WHEN** a user whose Can Delete News Articles privilege (bit 33) is not set attempts to delete an article
- **THEN** the server SHALL deny the request

#### Scenario: User without category management privilege cannot create categories

- **WHEN** a user whose Can Create News Categories privilege (bit 34) is not set attempts to create a category or bundle
- **THEN** the server SHALL deny the request

#### Scenario: User without category management privilege cannot delete categories

- **WHEN** a user whose Can Delete News Categories privilege (bit 37) is not set attempts to delete a category or bundle
- **THEN** the server SHALL deny the request

#### Scenario: User with full news privileges can perform all operations

- **WHEN** a user has bits 20, 21, 33, 34, and 37 all set
- **THEN** the user SHALL be able to read, post, delete articles, and create or delete categories and bundles
