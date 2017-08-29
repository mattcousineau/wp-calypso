/** @format */
/**
 * External dependencies
 */
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { get, noop, some, values, omit } from 'lodash';
import { connect } from 'react-redux';
import { translate } from 'i18n-calypso';
import Gridicon from 'gridicons';
import classnames from 'classnames';

/**
 * Internal dependencies
 */
import { isEnabled } from 'config';
import { getCurrentUser } from 'state/current-user/selectors';
import PostTime from 'reader/post-time';
import Gravatar from 'components/gravatar';
import { recordAction, recordGaEvent, recordTrack } from 'reader/stats';
import { getStreamUrl } from 'reader/route';
import PostCommentContent from './post-comment-content';
import PostCommentForm from './form';
import CommentEditForm from './comment-edit-form';
import { PLACEHOLDER_STATE } from 'state/comments/constants';
import { decodeEntities } from 'lib/formatting';
import PostCommentWithError from './post-comment-with-error';
import PostTrackback from './post-trackback.jsx';
import CommentActions from './comment-actions';

// values conveniently also correspond to css classNames to apply
export const POST_COMMENT_DISPLAY_TYPES = {
	singleLine: 'is-single-line',
	excerpt: 'is-excerpt',
	full: 'is-full',
};

class PostComment extends Component {
	static propTypes = {
		commentsTree: PropTypes.object.isRequired,
		commentId: PropTypes.oneOfType( [
			PropTypes.string, // can be 'placeholder-123'
			PropTypes.number,
		] ).isRequired,
		onReplyClick: PropTypes.func,
		depth: PropTypes.number,
		post: PropTypes.object,
		maxChildrenToShow: PropTypes.number,
		onCommentSubmit: PropTypes.func,
		maxDepth: PropTypes.number,
		showNestingReplyArrow: PropTypes.bool,
		displayType: PropTypes.oneOf( values( POST_COMMENT_DISPLAY_TYPES ) ),

		// connect()ed props:
		currentUser: PropTypes.object.isRequired,
	};

	static defaultProps = {
		onReplyClick: noop,
		errors: [],
		depth: 1,
		maxDepth: Infinity,
		maxChildrenToShow: 5,
		onCommentSubmit: noop,
		showNestingReplyArrow: false,
		displayType: POST_COMMENT_DISPLAY_TYPES.full,
	};

	state = {
		showReplies: false,
		showFull: false,
	};

	handleReadMoreClicked = () => this.setState( { showFull: true } );

	handleToggleRepliesClick = () => {
		this.setState( { showReplies: ! this.state.showReplies } );
	};

	handleReply = () => {
		this.props.onReplyClick( this.props.commentId );
		this.setState( { showReplies: true } ); // show the comments when replying
	};

	handleAuthorClick = event => {
		recordAction( 'comment_author_click' );
		recordGaEvent( 'Clicked Author Name' );
		recordTrack( 'calypso_reader_comment_author_click', {
			blog_id: this.props.post.site_ID,
			post_id: this.props.post.ID,
			comment_id: this.props.commentId,
			author_url: event.target.href,
		} );
	};

	renderRepliesList() {
		const commentChildrenIds = get( this.props.commentsTree, [ this.props.commentId, 'children' ] );
		// Hide children if more than maxChildrenToShow, but not if replying
		const exceedsMaxChildrenToShow =
			commentChildrenIds && commentChildrenIds.length < this.props.maxChildrenToShow;
		const showReplies = this.state.showReplies || exceedsMaxChildrenToShow;

		// No children to show
		if ( ! commentChildrenIds || commentChildrenIds.length < 1 ) {
			return null;
		}

		const showRepliesText = translate(
			'show %(numOfReplies)d reply',
			'show %(numOfReplies)d replies',
			{
				count: commentChildrenIds.length,
				args: { numOfReplies: commentChildrenIds.length },
			}
		);

		const hideRepliesText = translate(
			'hide %(numOfReplies)d reply',
			'hide %(numOfReplies)d replies',
			{
				count: commentChildrenIds.length,
				args: { numOfReplies: commentChildrenIds.length },
			}
		);

		let replyVisibilityText = null;
		if ( ! exceedsMaxChildrenToShow ) {
			replyVisibilityText = this.state.showReplies ? hideRepliesText : showRepliesText;
		}

		return (
			<div>
				{ !! replyVisibilityText
					? <button
							className="comments__view-replies-btn"
							onClick={ this.handleToggleRepliesClick }
						>
							<Gridicon icon="reply" size={ 18 } /> { replyVisibilityText }
						</button>
					: null }
				{ showReplies
					? <ol className="comments__list">
							{ commentChildrenIds.map( childId =>
								<PostComment
									{ ...omit( this.props, 'displayType' ) }
									depth={ this.props.depth + 1 }
									key={ childId }
									commentId={ childId }
								/>
							) }
						</ol>
					: null }
			</div>
		);
	}

	renderCommentForm() {
		if ( this.props.activeReplyCommentId !== this.props.commentId ) {
			return null;
		}

		return (
			<PostCommentForm
				ref="postCommentForm"
				post={ this.props.post }
				parentCommentId={ this.props.commentId }
				commentText={ this.props.commentText }
				onUpdateCommentText={ this.props.onUpdateCommentText }
				onCommentSubmit={ this.props.onCommentSubmit }
			/>
		);
	}

	getAuthorDetails = commentId => {
		const comment = get( this.props.commentsTree, [ commentId, 'data' ], {} );
		const commentAuthor = get( comment, 'author', {} );
		const commentAuthorName = decodeEntities( commentAuthor.name );
		const commentAuthorUrl = !! commentAuthor.site_ID
			? getStreamUrl( null, commentAuthor.site_ID )
			: commentAuthor && commentAuthor.URL;
		return { comment, commentAuthor, commentAuthorUrl, commentAuthorName };
	};

	renderAuthorTag = ( { authorName, authorUrl, commentId, className } ) => {
		return !! authorUrl
			? <a
					href={ authorUrl }
					className={ className }
					onClick={ this.handleAuthorClick }
					id={ `comment-${ commentId }` }
				>
					{ authorName }
				</a>
			: <strong className={ className } id={ `comment-${ commentId }` }>
					{ authorName }
				</strong>;
	};

	render() {
		const { commentsTree, commentId, depth, maxDepth } = this.props;
		const comment = get( commentsTree, [ commentId, 'data' ] );
		const displayType = this.state.showFull
			? POST_COMMENT_DISPLAY_TYPES.full
			: this.props.displayType;

		// todo: connect this constants to the state (new selector)
		const haveReplyWithError = some(
			get( commentsTree, [ this.props.commentId, 'children' ] ),
			childId =>
				get( commentsTree, [ childId, 'data', 'placeholderState' ] ) === PLACEHOLDER_STATE.ERROR
		);

		// If it's a pending comment, use the current user as the author
		if ( comment.isPlaceholder ) {
			comment.author = this.props.currentUser;
			comment.author.name = this.props.currentUser.display_name;
		} else {
			comment.author.name = decodeEntities( comment.author.name );
		}

		// If we have an error, render the error component instead
		if ( comment.isPlaceholder && comment.placeholderState === PLACEHOLDER_STATE.ERROR ) {
			return <PostCommentWithError { ...this.props } repliesList={ this.renderRepliesList() } />;
		}

		// Trackback / Pingback
		if ( comment.type === 'trackback' || comment.type === 'pingback' ) {
			return <PostTrackback { ...this.props } />;
		}

		// Author Details
		const parentCommentId = get( comment, 'parent.ID' );
		const { commentAuthorUrl, commentAuthorName } = this.getAuthorDetails( commentId );
		const {
			commentAuthorUrl: parentAuthorUrl,
			commentAuthorName: parentAuthorName,
		} = this.getAuthorDetails( parentCommentId );

		const postCommentClassnames = classnames( 'comments__comment', {
			[ 'depth-' + depth ]: depth <= maxDepth && depth <= 3, // only indent up to 3
		} );

		/* eslint-disable wpcalypso/jsx-gridicon-size */
		return (
			<li className={ postCommentClassnames }>
				<div className="comments__comment-author">
					{ commentAuthorUrl
						? <a href={ commentAuthorUrl } onClick={ this.handleAuthorClick }>
								<Gravatar user={ comment.author } />
							</a>
						: <Gravatar user={ comment.author } /> }

					{ this.renderAuthorTag( {
						authorUrl: commentAuthorUrl,
						authorName: commentAuthorName,
						commentId,
						className: 'comments__comment-username',
					} ) }
					{ this.props.showNestingReplyArrow &&
						parentAuthorName &&
						<span className="comments__comment-respondee">
							<Gridicon icon="chevron-right" size={ 16 } />
							{ this.renderAuthorTag( {
								className: 'comments__comment-respondee-link',
								authorName: parentAuthorName,
								authorUrl: parentAuthorUrl,
								commentId: parentCommentId,
							} ) }
						</span> }
					<div className="comments__comment-timestamp">
						<a href={ comment.URL }>
							<PostTime date={ comment.date } />
						</a>
					</div>
				</div>

				{ comment.status && comment.status === 'unapproved'
					? <p className="comments__comment-moderation">
							{ translate( 'Your comment is awaiting moderation.' ) }
						</p>
					: null }

				{ this.props.activeEditCommentId !== this.props.commentId &&
					<PostCommentContent
						content={ comment.content }
						isPlaceholder={ comment.isPlaceholder }
						className={ displayType }
						onMoreClicked={ this.handleReadMoreClicked }
						hideMore={ displayType === POST_COMMENT_DISPLAY_TYPES.full }
					/> }

				{ isEnabled( 'comments/moderation-tools-in-posts' ) &&
					this.props.activeEditCommentId === this.props.commentId &&
					<CommentEditForm
						post={ this.props.post }
						commentId={ this.props.commentId }
						commentText={ comment.content }
						onCommentSubmit={ this.props.onEditCommentCancel }
					/> }

				<CommentActions
					post={ this.props.post || {} }
					comment={ comment }
					showModerationTools={ this.props.showModerationTools }
					activeEditCommentId={ this.props.activeEditCommentId }
					activeReplyCommentId={ this.props.activeReplyCommentId }
					commentId={ this.props.commentId }
					editComment={ this.props.onEditCommentClick }
					editCommentCancel={ this.props.onEditCommentCancel }
					handleReply={ this.handleReply }
					onReplyCancel={ this.props.onReplyCancel }
				/>

				{ haveReplyWithError ? null : this.renderCommentForm() }
				{ this.renderRepliesList() }
			</li>
		);
	}
}

export default connect( state => ( {
	currentUser: getCurrentUser( state ),
} ) )( PostComment );
