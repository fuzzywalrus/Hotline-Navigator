import SwiftUI

// MARK: - Message Board & News

extension HotlineState {

  // MARK: - Message Board

  @MainActor
  @discardableResult
  func getMessageBoard() async throws -> [MessageBoardPost] {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    let result = try await client.getMessageBoard()
    self.messageBoard = MessageBoardPost.adjustDates(result.posts.map { MessageBoardPost.parse($0) })
    self.messageBoardSignature = result.dividerSignature
    self.messageBoardLoaded = true
    return self.messageBoard
  }

  @MainActor
  func postToMessageBoard(text: String) async throws {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    try await client.postMessageBoard(text)
  }

  // MARK: - News

  @MainActor
  func getNewsList(at path: [String] = []) async throws {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    let parentNewsGroup = self.findNews(in: self.news, at: path)

    // Send a categories request for bundle paths or root (empty path)
    if path.isEmpty || parentNewsGroup?.type == .bundle {
      print("HotlineState: Requesting categories at: /\(path.joined(separator: "/"))")

      let categories = try await client.getNewsCategories(path: path)

      // Create info for each category returned
      var newCategoryInfos: [NewsInfo] = []

      // Transform hotline categories into NewsInfo objects
      for category in categories {
        var newsCategoryInfo = NewsInfo(hotlineNewsCategory: category)

        if let lookupPath = newsCategoryInfo.lookupPath {
          // Merge returned category info with existing category info
          if let existingCategoryInfo = self.newsLookup[lookupPath] {
            print("HotlineState: Merging category into existing category at \(lookupPath)")

            existingCategoryInfo.count = newsCategoryInfo.count
            existingCategoryInfo.name = newsCategoryInfo.name
            existingCategoryInfo.path = newsCategoryInfo.path
            existingCategoryInfo.categoryID = newsCategoryInfo.categoryID
            newsCategoryInfo = existingCategoryInfo
          } else {
            print("HotlineState: New category added at \(lookupPath)")
            self.newsLookup[lookupPath] = newsCategoryInfo
          }
        }

        newCategoryInfos.append(newsCategoryInfo)
      }

      if let parent = parentNewsGroup {
        parent.children = newCategoryInfos
      } else if path.isEmpty {
        self.newsLoaded = true
        self.news = newCategoryInfos
      }
    } else {
      print("HotlineState: Requesting articles at: /\(path.joined(separator: "/"))")

      let articles = try await client.getNewsArticles(path: path)

      print("HotlineState: Organizing news at \(path.joined(separator: "/"))")

      // Create info for each article returned
      var newArticleInfos: [NewsInfo] = []

      for article in articles {
        var newsArticleInfo = NewsInfo(hotlineNewsArticle: article)

        if let lookupPath = newsArticleInfo.lookupPath {
          // Merge returned category info with existing category info
          if let existingArticleInfo = self.newsLookup[lookupPath] {
            print("HotlineState: Merging article into existing article at \(lookupPath)")

            existingArticleInfo.count = newsArticleInfo.count
            existingArticleInfo.name = newsArticleInfo.name
            existingArticleInfo.path = newsArticleInfo.path
            existingArticleInfo.articleUsername = newsArticleInfo.articleUsername
            existingArticleInfo.articleDate = newsArticleInfo.articleDate
            existingArticleInfo.articleFlavors = newsArticleInfo.articleFlavors
            existingArticleInfo.articleID = newsArticleInfo.articleID
            newsArticleInfo = existingArticleInfo
          } else {
            print("HotlineState: New article added at \(lookupPath)")
            self.newsLookup[lookupPath] = newsArticleInfo
          }
        }

        newArticleInfos.append(newsArticleInfo)
      }

      let organizedNewsArticles: [NewsInfo] = self.organizeNewsArticles(newArticleInfos)
      if let parent = parentNewsGroup {
        parent.children = organizedNewsArticles
      }
    }
  }

  @MainActor
  func getNewsArticle(id articleID: UInt, at path: [String], flavor: String = "text/plain") async throws -> String? {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    return try await client.getNewsArticle(id: UInt32(articleID), path: path, flavor: flavor)
  }

  @discardableResult
  @MainActor
  func postNewsArticle(title: String, body: String, at path: [String], parentID: UInt32 = 0) async throws -> NewsInfo? {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    try await client.postNewsArticle(title: title, text: body, path: path, parentID: parentID)
    print("HotlineState: News article posted")

    // Refresh article list and parent category count
    try await self.getNewsList(at: path)
    let parentPath = path.count > 1 ? Array(path.dropLast()) : [String]()
    try await self.getNewsList(at: parentPath)

    // Expand the category so the new post is visible
    if let category = self.findNews(in: self.news, at: path) {
      category.expanded = true

      // Find and expand the parent article if this is a reply, then return the new post
      if parentID != 0 {
        if let parentArticle = self.findArticle(id: UInt(parentID), in: category.children) {
          parentArticle.expanded = true
          // The reply should be in the parent's children — find by title
          return parentArticle.children.first { $0.name == title }
        }
      }
      else {
        // New top-level post — find by title among direct children
        return category.children.first { $0.name == title }
      }
    }

    return nil
  }

  private func findArticle(id: UInt, in items: [NewsInfo]) -> NewsInfo? {
    for item in items {
      if item.articleID == id {
        return item
      }
      if let found = self.findArticle(id: id, in: item.children) {
        return found
      }
    }
    return nil
  }

  @MainActor
  func newNewsFolder(name: String, path: [String] = []) async throws {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    try await client.newNewsFolder(name: name, path: path)
    try await self.getNewsList(at: path)
  }

  @MainActor
  func newNewsCategory(name: String, path: [String] = []) async throws {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    try await client.newNewsCategory(name: name, path: path)
    try await self.getNewsList(at: path)
  }

  @MainActor
  func deleteNewsItem(path: [String]) async throws {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    let parentPath = path.count > 1 ? Array(path.dropLast()) : [String]()
    try await client.deleteNewsItem(path: path)
    try await self.getNewsList(at: parentPath)
  }

  @MainActor
  func deleteNewsArticle(id: UInt, path: [String]) async throws {
    guard let client = self.client else {
      throw HotlineClientError.notConnected
    }

    try await client.deleteNewsArticle(id: UInt32(id), path: path)
    try await self.getNewsList(at: path)

    // Refresh parent level to update article counts
    let parentPath = path.count > 1 ? Array(path.dropLast()) : [String]()
    try await self.getNewsList(at: parentPath)
  }

  // MARK: - News Helpers

  func organizeNewsArticles(_ flatArticles: [NewsInfo]) -> [NewsInfo] {
    // Place articles under their parent
    var organized: [NewsInfo] = []
    for article in flatArticles {
      if let parentLookupPath = article.parentArticleLookupPath,
         let parentArticle = self.newsLookup[parentLookupPath] {
        if parentArticle.children.firstIndex(of: article) == nil {
          article.expanded = true
          parentArticle.children.append(article)
        }
      } else {
        organized.append(article)
      }
    }

    return organized
  }

  private func findNews(in newsToSearch: [NewsInfo], at path: [String]) -> NewsInfo? {
    guard !path.isEmpty, !newsToSearch.isEmpty, let currentName = path.first else { return nil }

    for news in newsToSearch {
      if news.name == currentName {
        if path.count == 1 {
          return news
        } else if !news.children.isEmpty {
          let remainingPath = Array(path[1...])
          return self.findNews(in: news.children, at: remainingPath)
        }
      }
    }

    return nil
  }
}
